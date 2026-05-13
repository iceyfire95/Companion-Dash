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
    s.on('values:snapshot', onSnapshot);
    s.on('values:update', onUpdate);
    return () => {
      s.off('values:snapshot', onSnapshot);
      s.off('values:update', onUpdate);
    };
  }, []);

  return values;
}
