import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../../utils/logger';

let io: SocketIOServer | undefined;

export const socketService = {
    initialize: (httpServer: HTTPServer, options: any) => {
        io = new SocketIOServer(httpServer, options);
        logger.info('SocketService initialized');
        return io;
    },

    getIO: (): SocketIOServer | undefined => {
        return io;
    },

    emit: (event: string, data: any) => {
        if (io) {
            io.emit(event, data);
        } else {
            logger.warn('SocketService: Attempted to emit event but IO is not initialized');
        }
    }
};
