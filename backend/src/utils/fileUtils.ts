
import fs from 'fs';
// import path from 'path';

export const ensureUploadDir = (dir: string) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};
