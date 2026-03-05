const DB_URL="https://txtdls-default-rtdb.firebaseio.com/";

const STORAGE_KEY="dls_hub_v1";

let ADMIN_PIN="35786491";

let adminUnlocked=false;

let competitions={};



function saveLocal(){
localStorage.setItem(STORAGE_KEY,JSON.stringify(competitions));
}

function loadLocal(){
let data=localStorage.getItem(STORAGE_KEY);
if(data) competitions=JSON.parse(data);
}



async function pushCloud(){

try{

await fetch(DB_URL+"dls_competitions.json",{
method:"PUT",
body:JSON.stringify(competitions)
});

await fetch(DB_URL+"sync_meta.json",{
method:"PUT",
body:JSON.stringify({updatedAt:Date.now()})
});

}catch(e){
console.log("Push error",e);
}

}



async function pullCloud(){

try{

let res=await fetch(DB_URL+"dls_competitions.json?"+Date.now());

let data=await res.json();

if(data){
competitions=data;
renderCompetitions();
}

}catch(e){
console.log("Sync error");
}

}

setInterval(pullCloud,5000);



document.getElementById("adminUnlock").onclick=()=>{

let p=prompt("Enter Admin PIN");

if(p===ADMIN_PIN){

adminUnlocked=true;

alert("Admin unlocked");

}else{

alert("Incorrect PIN");

}

};



document.getElementById("createLeague").onclick=()=>{

if(!adminUnlocked) return alert("Admin required");

let name=prompt("League name");

let teams=prompt("Enter teams separated by commas");

teams=teams.split(",").map(t=>t.trim());

let id="league_"+Date.now();

competitions[id]={

type:"league",
name,
teams,
matches:[],
table:{}

};

initTable(id);

saveLocal();
pushCloud();
renderCompetitions();

};



function initTable(id){

let comp=competitions[id];

comp.teams.forEach(t=>{

comp.table[t]={P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0};

});

}



function recordMatch(id){

if(!adminUnlocked) return;

let comp=competitions[id];

let t1=prompt("Team 1");

let t2=prompt("Team 2");

let g1=parseInt(prompt("Goals "+t1));

let g2=parseInt(prompt("Goals "+t2));

let played=comp.matches.filter(m=>

(m.t1===t1&&m.t2===t2)||(m.t1===t2&&m.t2===t1)

).length;

if(played>=2){

alert("These teams already played twice");

return;

}

comp.matches.push({t1,t2,g1,g2,time:Date.now()});

updateTable(comp,t1,t2,g1,g2);

saveLocal();
pushCloud();
renderCompetitions();

}



function updateTable(comp,t1,t2,g1,g2){

let A=comp.table[t1];
let B=comp.table[t2];

A.P++;
B.P++;

A.GF+=g1;
A.GA+=g2;

B.GF+=g2;
B.GA+=g1;

A.GD=A.GF-A.GA;
B.GD=B.GF-B.GA;

if(g1>g2){

A.W++;
B.L++;
A.Pts+=3;

}

else if(g2>g1){

B.W++;
A.L++;
B.Pts+=3;

}

else{

A.D++;
B.D++;
A.Pts++;
B.Pts++;

}

}



function deleteCompetition(id){

if(!adminUnlocked) return;

if(confirm("Delete competition?")){

delete competitions[id];

saveLocal();
pushCloud();
renderCompetitions();

}

}



function renderCompetitions(){

let area=document.getElementById("competitionList");

area.innerHTML="";

Object.entries(competitions).forEach(([id,c])=>{

let card=document.createElement("div");

card.className="card";

card.innerHTML=`

<h3>${c.name}</h3>
<p>${c.type}</p>

<button onclick="viewCompetition('${id}')">View</button>

${adminUnlocked?`<button onclick="recordMatch('${id}')">Add Result</button>`:""}

${adminUnlocked?`<button onclick="deleteCompetition('${id}')">Delete</button>`:""}

`;

area.appendChild(card);

});

}



function viewCompetition(id){

let comp=competitions[id];

let viewer=document.getElementById("viewer");

if(comp.type==="league"){

let rows=Object.entries(comp.table)

.sort((a,b)=>b[1].Pts-a[1].Pts)

.map(([team,s])=>`

<tr>

<td>${team}</td>
<td>${s.P}</td>
<td>${s.W}</td>
<td>${s.D}</td>
<td>${s.L}</td>
<td>${s.GF}</td>
<td>${s.GA}</td>
<td>${s.GD}</td>
<td>${s.Pts}</td>

</tr>

`).join("");

let log=comp.matches.map(m=>

`<li>${m.t1} ${m.g1} - ${m.g2} ${m.t2}</li>`

).join("");

viewer.innerHTML=`

<div class="card">

<h2>${comp.name}</h2>

<table>

<tr>

<th>Team</th>
<th>P</th>
<th>W</th>
<th>D</th>
<th>L</th>
<th>GF</th>
<th>GA</th>
<th>GD</th>
<th>Pts</th>

</tr>

${rows}

</table>

<h3>Match Log</h3>

<ul>${log}</ul>

</div>

`;

}

}



document.getElementById("searchInput").addEventListener("input",e=>{

let q=e.target.value.toLowerCase();

let cards=document.querySelectorAll(".card");

cards.forEach(c=>{

c.style.display=c.innerText.toLowerCase().includes(q)?"block":"none";

});

});



loadLocal();
pullCloud();
renderCompetitions();
