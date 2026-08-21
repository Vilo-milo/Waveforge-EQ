'use strict';
const {contextBridge,ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('waveforge',{
  detectBlackhole:()=>ipcRenderer.invoke('wf:detectBH'),
  micStatus:()=>ipcRenderer.invoke('wf:micStatus'),
  askMic:()=>ipcRenderer.invoke('wf:askMic'),
  listOutputs:()=>ipcRenderer.invoke('wf:listOutputs'),
  currentOutput:()=>ipcRenderer.invoke('wf:currentOutput'),
  setOutput:n=>ipcRenderer.invoke('wf:setOutput',n),
  restoreOutput:()=>ipcRenderer.invoke('wf:restore'),
  installBlackhole:()=>ipcRenderer.invoke('wf:installBH'),
  restartCoreAudio:()=>ipcRenderer.invoke('wf:restartCoreAudio'),
  onInstallLog:cb=>ipcRenderer.on('wf:installLog',(e,l)=>cb(l))
});
