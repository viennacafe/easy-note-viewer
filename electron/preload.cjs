const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('noteApi', {
    getRoot: () => ipcRenderer.invoke('settings:get-root'),
    setRoot: (rootPath) => ipcRenderer.invoke('settings:set-root', rootPath),
    chooseRoot: () => ipcRenderer.invoke('dialog:choose-root'),
    listAllNotes: (query) => ipcRenderer.invoke('notes:list-all', query),
    readNote: (relativePath) => ipcRenderer.invoke('notes:read', relativePath),
    openFile: (payload) => ipcRenderer.invoke('files:open', payload),
});
