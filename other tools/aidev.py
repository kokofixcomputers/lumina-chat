"""
Docker Linux API with WebSocket control and HTTP artifact serving. Used with the Dev Env tool.
"""
import asyncio
import websockets
import json
import docker
import threading
import time
import uuid
import subprocess
import os
import signal
import base64
from collections import defaultdict
from flask import Flask, send_from_directory, abort
from werkzeug.utils import secure_filename
import tempfile

API_KEY = "kk_your_api_key_here"
CONTAINER_TIMEOUT = 3600
COMMAND_TIMEOUT = 300
MAX_CONTAINERS = 50
FLASK_HOST = "0.0.0.0"
FLASK_PUBLIC_DOMAIN = "https://artifactaidev.kokodev.cc"
FLASK_PORT = 8766

client_sessions = {}
active_sessions = {}
artifact_files = {}  # session_id -> {file_hash: {'path': orig_path, 'name': filename}}
session_lock = threading.Lock()

app = Flask(__name__)
app.config["ARTIFACT_DIR"] = "/tmp/dock_linux_artifacts"
os.makedirs(app.config["ARTIFACT_DIR"], exist_ok=True)


@app.route("/artifact/<session_id>/<file_hash>")
def serve_artifact(session_id, file_hash):
    """Serve artifact file"""
    file_path = os.path.join(app.config["ARTIFACT_DIR"], file_hash)
    if not os.path.exists(file_path):
        abort(404, "File not found")
    
    with session_lock:
        artifacts = artifact_files.get(session_id, {})
        artifact = artifacts.get(file_hash)
    
    if not artifact:
        abort(404, "Artifact expired")
    
    return send_from_directory(
        app.config["ARTIFACT_DIR"], 
        file_hash,
        as_attachment=True,
        download_name=artifact.get("name", "file")
    )


class DockerLinuxAPI:
    def __init__(self):
        self.docker_client = docker.from_env()
        self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self.cleanup_thread.start()

    def validate_api_key(self, api_key):
        return api_key == API_KEY

    def create_session(self, websocket):
        if len(active_sessions) >= MAX_CONTAINERS:
            return None

        session_id = str(uuid.uuid4())
        try:
            container = self.docker_client.containers.run(
                "alpine:latest",
                detach=True,
                tty=True,
                stdin_open=True,
                network="host",
                mem_limit="512m",
                remove=False
            )
            print(f"✅ Session {session_id[:8]} -> {container.id[:12]}")

            with session_lock:
                active_sessions[session_id] = {
                    "container": container,
                    "last_activity": time.time(),
                    "current_task": None,
                }
                client_sessions[websocket] = session_id
                artifact_files[session_id] = {}

            return session_id
        except Exception as e:
            print(f"❌ Create failed: {e}")
            return None

    def get_session(self, session_id):
        with session_lock:
            return active_sessions.get(session_id)

    def execute_command(self, session_id, command):
        session = self.get_session(session_id)
        if not session:
            return {"error": "Session not found"}

        with session_lock:
            session["last_activity"] = time.time()
            session["current_task"] = "command"

        container_id = session["container"].id

        try:
            process = subprocess.Popen(
                ["docker", "exec", container_id, "sh", "-c", command],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                preexec_fn=os.setsid,
            )

            stdout, _ = process.communicate(timeout=COMMAND_TIMEOUT)

            with session_lock:
                session["current_task"] = None

            result = stdout.strip()
            return {
                "result": result or "✓ Command completed successfully",
                "exit_code": process.returncode,
            }

        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
            except:
                pass
            with session_lock:
                session["current_task"] = None
            return {"error": f"⏱️ Timeout after {COMMAND_TIMEOUT}s", "exit_code": 124}
        except Exception as e:
            with session_lock:
                session["current_task"] = None
            return {"error": f"❌ Execution failed: {str(e)}", "exit_code": 1}

    def create_file(self, session_id, path, content):
        encoded = base64.b64encode(content.encode()).decode()
        command = f"echo '{encoded}' | base64 -d > '{path}'"
        return self.execute_command(session_id, command)

    def generate_artifact(self, session_id, file_path):
        """✅ FIXED: Copy file using subprocess docker cp"""
        session = self.get_session(session_id)
        if not session:
            return {"error": "Session not found"}

        with session_lock:
            session["last_activity"] = time.time()

        container_id = session["container"].id
        safe_name = secure_filename(os.path.basename(file_path))
        file_hash = f"{uuid.uuid4().hex[:8]}_{safe_name}"
        host_path = os.path.join(app.config["ARTIFACT_DIR"], file_hash)

        # ✅ FIXED: Use subprocess for docker cp (binary safe)
        try:
            cmd = ["docker", "cp", f"{container_id}:{file_path}", host_path]
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                timeout=30, 
                check=True
            )
            print(f"✅ Copied {file_path} -> {host_path}")
        except subprocess.CalledProcessError as e:
            print(f"❌ Docker cp failed: {e.stderr.decode()}")
            return {"error": f"Failed to copy file: {e.stderr.decode().strip()}"}
        except Exception as e:
            return {"error": f"Copy failed: {str(e)}"}

        # Store artifact info
        artifact_info = {
            "original_path": file_path,
            "name": os.path.basename(file_path),
            "host_path": host_path,
            "container_id": container_id
        }

        with session_lock:
            artifact_files[session_id][file_hash] = artifact_info

        url = f"{FLASK_PUBLIC_DOMAIN}/artifact/{session_id}/{file_hash}"

        return {
            "type": "artifact",
            "url": url,
            "direct_download": url,
            "original_path": file_path,
            "file_hash": file_hash,
            "message": "Download ready! Expires with session."
        }

    def _cleanup_loop(self):
        while True:
            time.sleep(60)  # Check every minute
            with session_lock:
                current_time = time.time()
                to_remove_sessions = []
                to_remove_artifacts = []

                # Cleanup expired sessions
                for session_id, session_data in list(active_sessions.items()):
                    if (current_time - session_data["last_activity"] > CONTAINER_TIMEOUT and 
                        session_data.get("current_task") is None):
                        try:
                            session_data["container"].stop(timeout=10)
                            session_data["container"].remove(force=True)
                            print(f"🧹 Cleaned session {session_id[:8]}")
                            to_remove_sessions.append(session_id)
                        except:
                            pass

                # Remove session data
                for sid in to_remove_sessions:
                    active_sessions.pop(sid, None)
                    artifacts = artifact_files.pop(sid, {})
                    # Cleanup host files
                    for file_hash, info in artifacts.items():
                        host_path = info.get("host_path")
                        if host_path and os.path.exists(host_path):
                            try:
                                os.remove(host_path)
                            except:
                                pass


api = DockerLinuxAPI()


async def universal_websocket_handler(websocket):
    addr = getattr(websocket, "remote_address", "unknown")
    print(f"🌐 {addr} connected")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                response = await handle_request(websocket, data)
                if response:
                    await websocket.send(json.dumps(response))
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"error": "Invalid JSON"}))
    except Exception as e:
        print(f"❌ {addr}: {e}")
    finally:
        with session_lock:
            session_id = client_sessions.pop(websocket, None)
            if session_id:
                print(f"👋 {addr} left {session_id[:8]}")


async def handle_request(websocket, data):
    if not api.validate_api_key(data.get("api_key")):
        return {"error": "❌ Invalid API key"}

    task = data.get("task")

    if task == "create":
        session_id = api.create_session(websocket)
        if session_id:
            await websocket.send(json.dumps({"type": "update", "session": session_id, "status": "provisioning"}))
            await websocket.send(json.dumps({"type": "update", "session": session_id, "status": "done"}))
            return None
        return {"error": "❌ Max containers reached"}

    elif task == "join":
        session_id = data.get("session")
        if api.get_session(session_id):
            client_sessions[websocket] = session_id
            return {"type": "joined", "session": session_id}
        return {"error": "❌ Session not found"}

    elif task == "command":
        session_id = data.get("session")
        command = data.get("command")
        if not session_id or not command:
            return {"error": "❌ Missing session/command"}
        result = api.execute_command(session_id, command)
        return {"type": "result", "session": session_id, **result}

    elif task == "create_file":
        session_id = data.get("session")
        path = data.get("path")
        content = data.get("content", "")
        if not all([session_id, path]):
            return {"error": "❌ Missing session/path"}
        result = api.create_file(session_id, path, content)
        return {"type": "result", "session": session_id, **result}

    elif task == "artifact":
        session_id = data.get("session")
        file_path = data.get("file")
        if not all([session_id, file_path]):
            return {"error": "❌ Missing session/file path"}
        result = api.generate_artifact(session_id, file_path)
        return {"type": "result", "session": session_id, **result}

    return {"error": f"❓ Unknown task: {task}"}


async def main():
    print("🚀 Docker Linux API + HTTP Artifacts")
    print(f"🔑 API Key: {API_KEY}")
    print("🌐 WebSocket: ws://0.0.0.0:8765")
    print(f"📎 HTTP Artifacts: http://{FLASK_HOST}:{FLASK_PORT}")

    # Start Flask in thread
    flask_thread = threading.Thread(
        target=lambda: app.run(
            host=FLASK_HOST, port=FLASK_PORT, debug=False, use_reloader=False
        ),
        daemon=True,
    )
    flask_thread.start()
    time.sleep(1)  # Give Flask time to start
    print("✅ Flask HTTP server running!")

    # Start WebSocket
    server = await websockets.serve(universal_websocket_handler, "0.0.0.0", 8765)
    print("✅ WebSocket server running!")
    await server.wait_closed()


if __name__ == "__main__":
    try:
        import websockets, docker, flask
    except ImportError:
        subprocess.check_call(["pip", "install", "websockets==12.0", "docker", "flask", "werkzeug"])
    asyncio.run(main())
