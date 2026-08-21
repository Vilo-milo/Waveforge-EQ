'use strict';
const {app,BrowserWindow,ipcMain,systemPreferences} = require('electron');
const {execFile,execFileSync,spawn} = require('child_process');
const fs = require('fs');
const path = require('path');

let win = null;
let originalOutput = null;
let switched = false;

const fs2 = () => require('path').join(app.getPath('userData'),'audio-state.json');
function stashOriginal(n){ try{ require('fs').writeFileSync(fs2(),JSON.stringify({original:n})); }catch(e){} }
function loadStashed(){ try{ return JSON.parse(require('fs').readFileSync(fs2(),'utf8')).original; }catch(e){ return null; } }
function clearStashed(){ try{ require('fs').unlinkSync(fs2()); }catch(e){} }

const SW_CANDIDATES = ['/opt/homebrew/bin/SwitchAudioSource','/usr/local/bin/SwitchAudioSource'];
function swPath(){ return SW_CANDIDATES.find(p=>fs.existsSync(p)) || null; }
function sw(args){
  const p = swPath();
  if(!p) return Promise.resolve(null);
  return new Promise(res=>{
    execFile(p,args,{timeout:5000},(e,so)=>{
      res(e?null:String(so).trim());
    });
  });
}

function detectBlackhole(){
  try{
    const dir = '/Library/Audio/Plug-Ins/HAL';
    return fs.readdirSync(dir).some(f=>/blackhole/i.test(f));
  }catch(e){ return false; }
}

async function setOutputSmart(name){
  if(!name) return null;
  const list = await sw(['-a','-t','output']);
  if(!list) return null;
  const norm = s=>s.toLowerCase().replace(/\s*\([^)]*\)/g,'').replace(/\s+/g,' ').trim();
  const names = list.split('\n').map(s=>s.trim()).filter(Boolean);
  const targetName = norm(name);
  let target = names.find(n=>norm(n)===targetName);
  if(!target) target = names.find(n=>norm(n).startsWith(targetName)||targetName.startsWith(norm(n)));
  if(!target) return null;
  const cur = await sw(['-c','-t','output']);
  if(cur && norm(cur)===norm(target)){
    const stashed = loadStashed();
    if(stashed && !switched){ originalOutput = stashed; switched = true; }
    return target;
  }
  if(cur && !switched){ originalOutput = cur; switched = true; }
  stashOriginal(originalOutput);
  await sw(['-t','output','-s',target]);
  const now = await sw(['-c','-t','output']);
  return (now && norm(now)===norm(target)) ? now : null;
}

function createWindow(){
  win = new BrowserWindow({
    width:1080,
    height:940,
    minWidth:800,
    minHeight:640,
    title:'WaveForge',
    backgroundColor:'#0b0d12',
    titleBarStyle:'hiddenInset',
    trafficLightPosition:{x:18,y:18},
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      contextIsolation:true,
      nodeIntegration:false
    }
  });
  if(process.argv.includes('--autotest')){
    win.loadFile('index.html',{query:{autotest:'system'}});
  }else{
    win.loadFile('index.html');
  }
}

ipcMain.handle('wf:detectBH',()=>detectBlackhole());

ipcMain.handle('wf:micStatus',()=>systemPreferences.getMediaAccessStatus('microphone'));

ipcMain.handle('wf:askMic',async()=>{
  try{
    if(systemPreferences.getMediaAccessStatus('microphone')!=='granted'){
      return await systemPreferences.askForMediaAccess('microphone');
    }
    return true;
  }catch(e){ return false; }
});

ipcMain.handle('wf:listOutputs',async()=>{
  const list = await sw(['-a','-t','output']);
  return list?list.split('\n').map(s=>s.trim()).filter(Boolean):[];
});

ipcMain.handle('wf:currentOutput',()=>sw(['-c','-t','output']));

ipcMain.handle('wf:setOutput',(e,name)=>setOutputSmart(name));

ipcMain.handle('wf:restore',()=>{
  if(switched && originalOutput){
    switched = false;
    const orig = originalOutput;
    originalOutput = null;
    return sw(['-t','output','-s',orig]).then(r=>{
      if(r===orig) clearStashed();
      return r===orig;
    });
  }
  return Promise.resolve(false);
});

ipcMain.handle('wf:installBH',(event,pkg)=>{
  const target = pkg==='switchaudio-osx' ? 'switchaudio-osx' : 'blackhole-2ch';
  return new Promise(res=>{
    const p = spawn('brew',['install',target],{env:{...process.env,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'}});
    const send = l=>{ try{win.webContents.send('wf:installLog',l);}catch(e){} };
    p.stdout.on('data',d=>String(d).split('\n').forEach(l=>l&&send(l)));
    p.stderr.on('data',d=>String(d).split('\n').forEach(l=>l&&send(l)));
    p.on('error',e=>{ send('brew not found: '+e.message); res(1); });
    p.on('close',code=>{
      if(code===0) send('Done. You may need to restart the audio daemon or reboot once.');
      res(code);
    });
  });
});

ipcMain.handle('wf:restartCoreAudio',()=>{
  return new Promise(res=>{
    execFile('osascript',['-e','do shell script "launchctl kickstart -k system/com.apple.audio.coreaudiod" with administrator privileges'],{timeout:60000},(e)=>{
      res(e?String(e.message||e):'ok');
    });
  });
});

app.on('before-quit',()=>{
  if(switched && originalOutput){
    try{
      const p = swPath();
      if(p) execFileSync(p,['-t','output','-s',originalOutput],{timeout:3000});
    }catch(e){}
    switched = false;
    clearStashed();
  }
});

['SIGINT','SIGTERM'].forEach(sig=>{
  process.on(sig,()=>{
    if(switched && originalOutput){
      try{
        const p = swPath();
        if(p) execFileSync(p,['-t','output','-s',originalOutput],{timeout:3000});
      }catch(e){}
      switched = false;
      clearStashed();
    }
    process.exit(0);
  });
});

app.whenReady().then(async()=>{
  const stashed = loadStashed();
  if(stashed){
    const cur = await sw(['-c','-t','output']);
    if(cur && /blackhole/i.test(cur) && norm(cur)!==norm(stashed)){
      await sw(['-t','output','-s',stashed]);
    }
    clearStashed();
  }
  createWindow();
});

app.whenReady().then(createWindow);
app.on('window-all-closed',()=>app.quit());
