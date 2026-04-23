import net from 'node:net';

export interface PortStatus {
  port: number;
  available: boolean;
  details: string;
}

export async function getPortStatus(port: number): Promise<PortStatus> {
  return new Promise((resolve) => {
    const socket = net.connect({
      host: '127.0.0.1',
      port,
    });

    socket.setTimeout(1500);

    socket.once('connect', () => {
      socket.end();
      resolve({
        port,
        available: false,
        details: 'occupied',
      });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({
        port,
        available: false,
        details: 'timeout',
      });
    });

    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') {
        resolve({
          port,
          available: true,
          details: 'available',
        });
        return;
      }

      resolve({
        port,
        available: false,
        details: error.code ?? error.message,
      });
    });
  });
}

export async function assertPortAvailable(port: number, label: string): Promise<void> {
  const status = await getPortStatus(port);

  if (!status.available) {
    throw new Error(
      `[t3x-local] ${label} port ${port} is already in use (${status.details}). ` +
        'Choose a different port or stop the conflicting process first.'
    );
  }
}
