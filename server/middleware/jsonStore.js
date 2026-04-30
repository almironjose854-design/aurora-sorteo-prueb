const fs = require('fs').promises;
const path = require('path');

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function createBackup(dataDir, filename, data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = path.join(dataDir, 'backups', `${filename}.${timestamp}.json`);
  await ensureDir(path.join(dataDir, 'backups'));
  await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf8');
}

const jsonStore = {
  async read(dataDir, filename, defaultValue) {
    const filePath = path.join(dataDir, filename);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content || 'null') ?? defaultValue;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return defaultValue;
      }
      throw new Error(`Read failed for ${filename}: ${error.message}`);
    }
  },

  async write(dataDir, filename, data) {
    const filePath = path.join(dataDir, filename);
    
    // Atomic write with backup
    const tempPath = filePath + '.tmp.' + Date.now();
    const backupData = await this.read(dataDir, filename, []);
    
    try {
      await ensureDir(dataDir);
      
      // Create backup if data changed
      if (JSON.stringify(backupData) !== JSON.stringify(data)) {
        await createBackup(dataDir, filename, backupData);
      }
      
      // Write new data atomically
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tempPath, filePath);
      
    } catch (error) {
      // Cleanup temp on failure
      try { await fs.unlink(tempPath); } catch {}
      throw new Error(`Write failed for ${filename}: ${error.message}`);
    }
  }
};

module.exports = { jsonStore };
