import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let sharedSocket: Socket | null = null;
function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({ transports: ['websocket', 'polling'] });
  }
  return sharedSocket;
}

export function useVariableValues(): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const s = getSocket();
    const onSnapshot = (snap: Record<string, string>) => setValues({ ...snap });
    const onUpdate = ({ id, value }: { id: string; value: string }) => {
      setValues(prev => (prev[id] === value ? prev : { ...prev, [id]: value }));
    };
    // Server emits 'values:delete' when a variable leaves the wanted
    // set (no panel / watch / tally references it anymore). Drop our
    // local cache entry so the Variables page reflects reality.
    const onDelete = ({ id }: { id: string }) => {
      setValues(prev => {
        if (!Object.prototype.hasOwnProperty.call(prev, id)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };
    s.on('values:snapshot', onSnapshot);
    s.on('values:update', onUpdate);
    s.on('values:delete', onDelete);
    return () => {
      s.off('values:snapshot', onSnapshot);
      s.off('values:update', onUpdate);
      s.off('values:delete', onDelete);
    };
  }, []);

  return values;
}
