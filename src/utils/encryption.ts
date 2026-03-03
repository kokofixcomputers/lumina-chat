import CryptoJS from 'crypto-js';

export function encryptData(data: any, password: string): string {
  const jsonStr = JSON.stringify(data);
  return CryptoJS.AES.encrypt(jsonStr, password).toString();
}

export function decryptData(encryptedData: string, password: string): any {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedStr) return null;
    return JSON.parse(decryptedStr);
  } catch {
    return null;
  }
}
