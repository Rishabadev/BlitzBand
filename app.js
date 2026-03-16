let manualDisconnect = false;
let device = null;
let characteristic = null;
let reconnecting = false;

let csvHistory = [];
let lastStoredWindow = -1;

let chart;
let chartLabels = [];
let chartData = [];

const connectionStatusEl = document.getElementById('connectionStatus');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const resetBtn = document.getElementById("resetBtn");
const downloadBtn = document.getElementById("downloadBtn");

const statusText = document.getElementById("statusText");
const statusDot  = document.getElementById("statusDot");

const ppsEl   = document.getElementById("pps");
const countEl = document.getElementById("punchCount");
const timeEl  = document.getElementById("timer");
const p60El   = document.getElementById("p60");

const aboutBtn = document.getElementById('aboutBtn');
const aboutPanel = document.getElementById('aboutPanel');

const pulseDot = document.getElementById("pulseDot");

function setStatus(text, dot){

  statusText.textContent = text;
  statusDot.textContent = dot;

  if (text === "Connected"){
    connectionStatusEl.classList.remove("disconnected");
    connectionStatusEl.classList.add("connected");
  }
  else{
    connectionStatusEl.classList.remove("connected");
    connectionStatusEl.classList.add("disconnected");
  }
}

connectBtn.addEventListener("click", connect);
disconnectBtn.addEventListener("click", disconnect);

if(resetBtn) resetBtn.addEventListener("click", resetDevice);
if(downloadBtn) downloadBtn.addEventListener("click", downloadCSV);

async function connect(){

  manualDisconnect = false;

  try{

    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ["91bad492-b950-4226-aa2b-4ede9fa42f59"] }]
    });

    device.addEventListener("gattserverdisconnected", onDisconnected);

    await connectGATT();

    setStatus("Connected","🟢");

    connectBtn.disabled = true;
    disconnectBtn.disabled = false;

    if(resetBtn) resetBtn.disabled = false;

  }
  catch(error){

    console.error(error);
    setStatus("Connection Failed","🔴");

  }
}

async function connectGATT(){

  const server = await device.gatt.connect();

  const service = await server.getPrimaryService(
    "91bad492-b950-4226-aa2b-4ede9fa42f59"
  );

  characteristic = await service.getCharacteristic(
    "0d563a58-196a-48ce-ace2-dfec78acc814"
  );

  await characteristic.startNotifications();

  characteristic.addEventListener(
    "characteristicvaluechanged",
    handleData
  );
}

function disconnect(){

  manualDisconnect = true;

  if(device && device.gatt.connected){
    device.gatt.disconnect();
  }

  setStatus("Disconnected","🔴");

  connectBtn.disabled = false;
  disconnectBtn.disabled = true;

  if(resetBtn) resetBtn.disabled = true;

  [ppsEl,countEl,timeEl,p60El].forEach(el => {

    if(!el) return;

    el.textContent = "--";
    el.classList.remove("live");
    el.classList.add("waiting");

  });
}

async function onDisconnected(){

  if(manualDisconnect){
    manualDisconnect = false;
    return;
  }

  if(reconnecting) return;

  reconnecting = true;

  setStatus("Reconnecting...","🟡");

  while(device && !device.gatt.connected){

    try{

      await connectGATT();

      setStatus("Connected","🟢");

      reconnecting = false;
      return;

    }
    catch{

      await new Promise(r => setTimeout(r,1500));

    }
  }

  reconnecting = false;
}

function handleData(event){

  const raw = new TextDecoder()
  .decode(event.target.value)
  .trim();

  try{

    const data = {};

    raw.split(",").forEach(pair => {
      const [key,value] = pair.split(":");
      data[key] = value;
    });

    const pps   = parseFloat(data.pps);
    const count = parseInt(data.count);
    const time  = parseInt(data.time);
    const p60   = parseInt(data.p60);

    if(isNaN(pps) || isNaN(count) || isNaN(time) || isNaN(p60)) return;

    const currentWindow = Math.floor(time / 60);

    if(currentWindow !== lastStoredWindow && time >= 60){

        const t = currentWindow * 60;

        csvHistory.push({
          time: t,
          punches: p60
        });

        chartLabels.push(t);
        chartData.push(p60);

        if(chart) chart.update();

        lastStoredWindow = currentWindow;
    }

    setLiveValue(ppsEl, pps.toFixed(2));
    setLiveValue(countEl, count);
    setLiveValue(timeEl, formatTime(time));
    setLiveValue(p60El, p60);

    if(pulseDot){
      pulseDot.classList.add("active");
      setTimeout(()=>pulseDot.classList.remove("active"),200);
    }

  }
  catch(err){
    console.error("Bad packet:",raw,err);
  }
}

async function resetDevice(){

  if(!characteristic) return;

  try{

    const encoder = new TextEncoder();

    await characteristic.writeValue(
      encoder.encode("RST")
    );

    [ppsEl,countEl,timeEl,p60El].forEach(el => {

      if(!el) return;

      el.textContent = "0";
      el.classList.remove("live");
      el.classList.add("waiting");

    });

    csvHistory = [];
    lastStoredWindow = -1;

    chartLabels.length = 0;
    chartData.length = 0;

    if(chart) chart.update();

  }
  catch(e){
    console.error("Reset failed",e);
  }
}

function downloadCSV(){

  if(csvHistory.length === 0){
    alert("No data recorded yet.");
    return;
  }

  let csv = "Time (s),Punches in 60s\n";

  csvHistory.forEach(row => {
    csv += `${row.time},${row.punches}\n`;
  });

  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "blitzband_punch_data.csv";

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

if(aboutBtn && aboutPanel){

  aboutBtn.addEventListener("click", () => {
    aboutPanel.classList.toggle("open");
  });

}

function setLiveValue(el,value){

  if(!el) return;

  if(el.classList.contains("waiting")){
    el.classList.remove("waiting");
    el.classList.add("live");
  }

  el.textContent = value;
}

function formatTime(sec){

  const m = String(Math.floor(sec/60)).padStart(2,'0');
  const s = String(sec%60).padStart(2,'0');

  return `${m}:${s}`;
}

function initChart(){

  const ctx = document.getElementById("performanceChart").getContext("2d");

  const gradientFill = ctx.createLinearGradient(0,0,0,350);
  gradientFill.addColorStop(0,"rgba(230,30,37,0.6)");
  gradientFill.addColorStop(1,"rgba(230,30,37,0.0)");

  Chart.defaults.color = "#888888";
  Chart.defaults.font.family = "'Oswald', sans-serif";

  chart = new Chart(ctx,{

    type:"line",

    data:{
      labels:chartLabels,
      datasets:[{
        label:"Punches in 60s",
        data:chartData,
        borderColor:"#e61e25",
        backgroundColor:gradientFill,
        borderWidth:3,
        pointBackgroundColor:"#111111",
        pointBorderColor:"#e61e25",
        pointBorderWidth:2,
        pointRadius:4,
        fill:true,
        tension:0.4
      }]
    },

    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false}
      },
      scales:{
        x:{
          grid:{color:"rgba(255,255,255,0.05)"}
        },
        y:{
          beginAtZero:true,
          grid:{color:"rgba(255,255,255,0.05)"}
        }
      }
    }

  });
}

window.onload = initChart;