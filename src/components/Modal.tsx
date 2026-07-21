import { useEffect, useState } from 'react';

const CLOSE_MS = 150;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  panelClassName?: string;
  overlayClassName?: string;
}

// Generic centered modal: mounts on `open`, plays an exit animation on close
// before actually unmounting (plain conditional rendering has no way to do this).
export default function Modal({ open, onClose, children, panelClassName = '', overlayClassName = '' }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => setMounted(false), CLOSE_MS);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  return (
    <div
      className={`modal-overlay ${closing ? 'animate-fade-out' : 'animate-fade-in'} ${overlayClassName}`}
      onClick={onClose}
    >
      <div
        className={`${closing ? 'animate-float-out' : 'animate-float-in'} ${panelClassName}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
