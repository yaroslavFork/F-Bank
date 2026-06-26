const SUPABASE_URL='https://monyjcyypnqknrzzxjej.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbnlqY3l5cG5xa25yenp4amVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTIyMTQsImV4cCI6MjA5NzcyODIxNH0.OQsb1EunHj8tXj22iGu4AJUc_DwgioAD8TnTNJ8PA9A';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let currentUser=null,currentUserData=null,realtimeSubs=[];

function formatDate(d){return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});}
function generateCardNumber(){return Array.from({length:4},()=>Math.floor(1000+Math.random()*9000)).join(' ');}
function generateId(n){return 'FK-'+n.toUpperCase().slice(0,3)+'-'+Math.floor(1000+Math.random()*9000);}

// ── TOAST ──
function showToast(text,type='success',dur=2500){
const t=document.getElementById('toast');
t.textContent=text;t.className='toast'+(type==='error'?' error':'');
t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);
}

// ── ANIMATIONS ──
function showPromoAnim(amount){
document.getElementById('promoAnimAmount').textContent='+'+Number(amount).toLocaleString('ru-RU')+' DUM';
const ov=document.getElementById('promoOverlay'),coins=document.getElementById('promoCoins');
coins.innerHTML='';
for(let i=0;i<20;i++){
const c=document.createElement('div');c.className='coin';
c.textContent=['🪙','💚','✨','🎉','💰'][Math.floor(Math.random()*5)];
c.style.left=Math.random()*100+'%';c.style.top=Math.random()*40+'%';
c.style.animationDelay=Math.random()+'s';c.style.fontSize=(16+Math.random()*20)+'px';
coins.appendChild(c);
}
ov.classList.add('show');setTimeout(()=>ov.classList.remove('show'),3000);
}
function closePromoAnim(){document.getElementById('promoOverlay').classList.remove('show');}

function showTransferAnim(amount,to){
document.getElementById('transferAnimAmount').textContent=Number(amount).toLocaleString('ru-RU')+' DUM';
document.getElementById('transferAnimTo').textContent='→ '+to;
const ov=document.getElementById('transferOverlay');
ov.classList.add('show');setTimeout(()=>ov.classList.remove('show'),2500);
}
function closeTransferAnim(){document.getElementById('transferOverlay').classList.remove('show');}

// ── PROMO MODAL ──
function openPromoModal(){
if(currentUserData&&currentUserData.frozen){showToast('Аккаунт заморожен ❄️','error');return;}
document.getElementById('promoInput').value='';
document.getElementById('promoMsg').textContent='';
document.getElementById('promoMsg').className='msg-box';
document.getElementById('promoModal').classList.add('show');
setTimeout(()=>document.getElementById('promoInput').focus(),400);
}
function closePromoModal(){document.getElementById('promoModal').classList.remove('show');}

async function activatePromo(){
const code=document.getElementById('promoInput').value.trim().toUpperCase();
const msg=document.getElementById('promoMsg');
if(!code){showMsg(msg,'Введите промокод','error');return;}

const btn=document.querySelector('.btn-activate');
btn.textContent='...';btn.disabled=true;

try{
const {data:promo}=await sb.from('promocodes').select('*').eq('code',code).eq('active',true).maybeSingle();
if(!promo){showMsg(msg,'Промокод не найден','error');return;}
if(promo.max_uses>0&&promo.used_count>=promo.max_uses){showMsg(msg,'Промокод исчерпан','error');return;}
// Check if THIS user already used it
const {data:usedCheck}=await sb.from('promo_uses').select('id').eq('code',code).eq('username',currentUser).maybeSingle();
if(usedCheck){showMsg(msg,'Вы уже использовали этот промокод','error');return;}
const {data:user}=await sb.from('users').select('balance').eq('username',currentUser).maybeSingle();
await sb.from('users').update({balance:Number(user.balance)+promo.amount}).eq('username',currentUser);
await sb.from('transactions').insert([{username:currentUser,type:'промокод',description:'Промокод: '+code,amount:promo.amount,date:formatDate(new Date())}]);
await sb.from('promo_uses').insert([{code,username:currentUser}]);
await sb.from('promocodes').update({used_count:promo.used_count+1}).eq('code',code);
closePromoModal();
showPromoAnim(promo.amount);
}finally{
btn.textContent='АКТИВИРОВАТЬ';btn.disabled=false;
}
}

// ── AUTH ──
async function init(){
try{
// Test connection
await Promise.race([
sb.from('users').select('count',{count:'exact',head:true}),
new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),8000))
]);
}catch(e){
document.querySelector('.loading-text').textContent='Ошибка подключения';
console.error('Supabase error:',e);
// Still show login after error
setTimeout(()=>{
document.getElementById('loadingScreen').classList.add('hidden');
document.getElementById('loginScreen').classList.remove('hidden');
},1500);
return;
}
document.getElementById('loadingScreen').classList.add('hidden');
document.getElementById('loginScreen').classList.remove('hidden');
updateStatusTime();
}

function togglePass(){
const inp=document.getElementById('loginPass'),btn=document.getElementById('eyeBtn');
if(inp.type==='password'){inp.type='text';btn.textContent='🙈';}
else{inp.type='password';btn.textContent='👁';}
}

async function doLogin(){
const name=document.getElementById('loginName').value.trim().toLowerCase();
const pass=document.getElementById('loginPass').value;
const err=document.getElementById('loginError');
if(!name||!pass){err.textContent='Заполните все поля';return;}
const btn=document.querySelector('.btn-primary');
btn.textContent='...';btn.disabled=true;
try{
const {data,error}=await sb.from('users').select('*').eq('username',name).eq('password',pass).maybeSingle();
if(error){err.textContent='Ошибка: '+error.message;return;}
if(!data){err.textContent='Неверное имя или пароль';return;}
err.textContent='';currentUser=name;currentUserData=data;
if(data.role==='admin')showAdmin();else showApp(data);
}finally{btn.textContent='ВОЙТИ';btn.disabled=false;}
}

document.getElementById('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('loginName').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('loginPass').focus();});

function doLogout(){
realtimeSubs.forEach(s=>sb.removeChannel(s));realtimeSubs=[];
currentUser=null;currentUserData=null;
document.getElementById('loginScreen').classList.remove('hidden');
document.getElementById('appScreen').classList.add('hidden');
document.getElementById('adminScreen').classList.remove('active');
document.getElementById('loginName').value='';
document.getElementById('loginPass').value='';
document.getElementById('loginError').textContent='';
switchTab('tabCard',0);
}

// ── REALTIME ──
function setupRealtime(){
const userSub=sb.channel('user-rt-'+currentUser)
.on('postgres_changes',{event:'UPDATE',schema:'public',table:'users',filter:'username=eq.'+currentUser},payload=>{
const d=payload.new;currentUserData={...currentUserData,...d};
updateBalanceUI(d.balance);
if(d.frozen!==undefined){
document.getElementById('frozenBanner').classList.toggle('hidden',!d.frozen);
document.getElementById('bankCard').classList.toggle('frozen',!!d.frozen);
document.getElementById('profileAvatar').classList.toggle('frozen',!!d.frozen);
if(d.frozen)showToast('❄️ Аккаунт заморожен','error',4000);
else showToast('✅ Аккаунт разморожен!');
}
}).subscribe();
realtimeSubs.push(userSub);

const txSub=sb.channel('tx-rt-'+currentUser)
.on('postgres_changes',{event:'INSERT',schema:'public',table:'transactions',filter:'username=eq.'+currentUser},
async()=>await renderTransactions()).subscribe();
realtimeSubs.push(txSub);

const taskSub=sb.channel('tasks-rt-all')
.on('postgres_changes',{event:'*',schema:'public',table:'tasks'},
async()=>{if(document.getElementById('tabTasks').classList.contains('active'))await renderTasks();})
.on('postgres_changes',{event:'*',schema:'public',table:'task_takers'},
async()=>{if(document.getElementById('tabTasks').classList.contains('active'))await renderTasks();})
.subscribe();
realtimeSubs.push(taskSub);
}

function setupAdminRealtime(){
const sub=sb.channel('admin-rt-all')
.on('postgres_changes',{event:'*',schema:'public',table:'users'},async()=>{await renderAdminUsers();await populateAdminSelect();})
.on('postgres_changes',{event:'*',schema:'public',table:'tasks'},async()=>await renderAdminTasks())
.on('postgres_changes',{event:'*',schema:'public',table:'task_takers'},async()=>await renderAdminTasks())
.subscribe();
realtimeSubs.push(sub);
}

// ── APP ──
async function showApp(user){
document.getElementById('loginScreen').classList.add('hidden');
document.getElementById('appScreen').classList.remove('hidden');
document.getElementById('greetName').textContent=user.username;
document.getElementById('cardNumber').textContent=user.card_number||'•••• •••• •••• ••••';
document.getElementById('cardHolder').textContent=user.username.toUpperCase();
document.getElementById('profileAvatar').textContent=user.username[0].toUpperCase();
document.getElementById('profileName').textContent=user.username;
document.getElementById('profileId').textContent=user.user_id||'FK-???';
document.getElementById('infoCardNum').textContent=user.card_number||'—';
document.getElementById('infoCity').textContent=user.city||'Не указан';
document.getElementById('infoJoined').textContent=user.joined||'—';
const frozen=!!user.frozen;
document.getElementById('frozenBanner').classList.toggle('hidden',!frozen);
document.getElementById('bankCard').classList.toggle('frozen',frozen);
document.getElementById('profileAvatar').classList.toggle('frozen',frozen);
updateBalanceUI(user.balance);
await renderTransactions();
await populateTransferSelect();
updateStatusTime();
setupRealtime();
}

function updateBalanceUI(balance){
const b=Number(balance||0);
const el=document.getElementById('balanceAmount');
el.textContent=b.toLocaleString('ru-RU');
el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');
setTimeout(()=>el.classList.remove('pop'),400);
document.getElementById('infoBalance').textContent=b.toLocaleString('ru-RU')+' DUM';
}

async function refreshBalance(){
const {data}=await sb.from('users').select('balance').eq('username',currentUser).maybeSingle();
if(data){currentUserData.balance=data.balance;updateBalanceUI(data.balance);}
}

async function renderTransactions(){
const {data:txs}=await sb.from('transactions').select('*').eq('username',currentUser).order('created_at',{ascending:false}).limit(50);
const icons={перевод:'💸',пополнение:'⬆️',списание:'⬇️',получено:'📥',промокод:'🎟️',задание:'📋'};
const colors={перевод:'rgba(255,64,96,0.1)',получено:'rgba(0,255,136,0.08)',пополнение:'rgba(0,255,136,0.08)',списание:'rgba(255,64,96,0.1)',промокод:'rgba(245,200,66,0.1)',задание:'rgba(0,229,255,0.1)'};
function txHTML(tx){
const isPlus=tx.amount>0,type=tx.type||'операция';
return `<div class="tx-item"><div class="tx-icon" style="background:${colors[type]||'rgba(0,255,136,0.05)'}">${icons[type]||'💳'}</div><div class="tx-info"><div class="tx-name">${tx.description||type}</div><div class="tx-date">${tx.date}</div></div><div class="tx-amount ${isPlus?'plus':'minus'}">${isPlus?'+':''}${Number(tx.amount).toLocaleString('ru-RU')} DUM</div></div>`;
}
const empty='<div style="color:var(--muted);font-size:13px;padding:16px 0;text-align:center">Нет операций</div>';
const list=txs||[];
document.getElementById('recentTx').innerHTML=list.length?list.slice(0,5).map(txHTML).join(''):empty;
document.getElementById('fullHistory').innerHTML=list.length?list.map(txHTML).join(''):empty;
}

async function populateTransferSelect(){
const {data}=await sb.from('users').select('username').neq('username',currentUser).neq('role','admin').eq('frozen',false);
const sel=document.getElementById('transferTo');
sel.innerHTML='<option value="">Кому перевести...</option>';
(data||[]).forEach(u=>{const o=document.createElement('option');o.value=u.username;o.textContent=u.username;sel.appendChild(o);});
}

async function doTransfer(){
if(currentUserData&&currentUserData.frozen){showToast('Аккаунт заморожен ❄️','error');return;}
const to=document.getElementById('transferTo').value;
const amount=parseInt(document.getElementById('transferAmount').value);
const msg=document.getElementById('transferMsg');
if(!to){showMsg(msg,'Выберите получателя','error');return;}
if(!amount||amount<=0){showMsg(msg,'Введите корректную сумму','error');return;}
const btn=document.querySelector('.btn-transfer');
btn.textContent='...';btn.disabled=true;
try{
const {data:sender}=await sb.from('users').select('balance').eq('username',currentUser).maybeSingle();
const {data:receiver}=await sb.from('users').select('balance').eq('username',to).maybeSingle();
if(!receiver){showMsg(msg,'Получатель не найден','error');return;}
if(Number(sender.balance)<amount){showMsg(msg,'Недостаточно средств','error');return;}
const date=formatDate(new Date());
await sb.from('users').update({balance:Number(sender.balance)-amount}).eq('username',currentUser);
await sb.from('users').update({balance:Number(receiver.balance)+amount}).eq('username',to);
await sb.from('transactions').insert([
{username:currentUser,type:'перевод',description:'Перевод → '+to,amount:-amount,date},
{username:to,type:'получено',description:'Получено от '+currentUser,amount:+amount,date}
]);
document.getElementById('transferAmount').value='';
document.getElementById('transferTo').value='';
showTransferAnim(amount,to);
await refreshBalance();
}finally{btn.textContent='ОТПРАВИТЬ ➤';btn.disabled=false;}
}

// ── TASKS (USER) ──
async function renderTasks(){
const {data:tasks}=await sb.from('tasks').select('*').eq('active',true).order('created_at',{ascending:false});
const {data:myTakes}=await sb.from('task_takers').select('*').eq('username',currentUser);
const myMap={};(myTakes||[]).forEach(t=>myMap[t.task_id]=t);
// count all takers per task
const {data:allTakers}=await sb.from('task_takers').select('task_id');
const countMap={};(allTakers||[]).forEach(t=>{countMap[t.task_id]=(countMap[t.task_id]||0)+1;});
const container=document.getElementById('tasksList');
if(!tasks||!tasks.length){container.innerHTML='<div style="color:var(--muted);font-size:13px;padding:16px 20px;text-align:center">Нет доступных заданий</div>';return;}
container.innerHTML=tasks.map(task=>{
const my=myMap[task.id];
const takenCount=countMap[task.id]||0;
const maxSlots=task.max_takers||0;
const isFull=maxSlots>0&&takenCount>=maxSlots;
let badge,actionBtn='';
if(my){
badge=my.status==='done'?'<span class="task-badge done">✅ Выполнено</span>':'<span class="task-badge progress">⏳ В процессе</span>';
}else if(isFull){
badge='<span class="task-badge full">🔒 Мест нет</span>';
}else{
badge='<span class="task-badge open">🟢 Открыто</span>';
actionBtn=`<button class="btn-task-action" onclick="takeTask('${task.id}')">Взяться</button>`;
}
const slotText=maxSlots>0?`${takenCount}/${maxSlots} взялись`:`${takenCount} взялись`;
return `<div class="task-card ${my?(my.status==='done'?'done-card':'in-progress'):''}">
<div class="task-title-row"><div class="task-title">${task.title}</div><div class="task-reward">+${Number(task.reward).toLocaleString('ru-RU')} DUM</div></div>
${task.description?`<div class="task-desc">${task.description}</div>`:''}
<div class="task-meta">👥 ${slotText}${maxSlots>0?' • макс. '+maxSlots:''}</div>
<div class="task-status-row">${badge}${actionBtn}</div>
</div>`;
}).join('');
}

async function takeTask(taskId){
if(currentUserData&&currentUserData.frozen){showToast('Аккаунт заморожен ❄️','error');return;}
const {data:existing}=await sb.from('task_takers').select('id').eq('task_id',taskId).eq('username',currentUser).maybeSingle();
if(existing){showToast('Вы уже взялись за это задание','error');return;}
// check slots again
const {data:task}=await sb.from('tasks').select('max_takers').eq('id',taskId).maybeSingle();
if(task&&task.max_takers>0){
const {count}=await sb.from('task_takers').select('*',{count:'exact',head:true}).eq('task_id',taskId);
if(count>=task.max_takers){showToast('Мест больше нет 🔒','error');await renderTasks();return;}
}
await sb.from('task_takers').insert([{task_id:taskId,username:currentUser,status:'taken'}]);
showToast('📋 Задание принято!');await renderTasks();
}

// ── ADMIN ──
async function showAdmin(){
document.getElementById('loginScreen').classList.add('hidden');
document.getElementById('adminScreen').classList.add('active');
await Promise.all([renderAdminUsers(),populateAdminSelect(),renderPromos(),renderAdminTasks()]);
setupAdminRealtime();
}

async function createUser(){
const name=document.getElementById('newUsername').value.trim().toLowerCase();
const pass=document.getElementById('newPassword').value;
const balance=parseInt(document.getElementById('newBalance').value)||0;
const city=document.getElementById('newCity').value.trim();
const msg=document.getElementById('createMsg');
if(!name||!pass){showMsg(msg,'Заполните имя и пароль','error');return;}
if(name==='admin'){showMsg(msg,'Имя "admin" зарезервировано','error');return;}
const {data:ex}=await sb.from('users').select('username').eq('username',name).maybeSingle();
if(ex){showMsg(msg,'Житель уже существует','error');return;}
const date=formatDate(new Date());
const {error}=await sb.from('users').insert([{username:name,password:pass,role:'user',balance,card_number:generateCardNumber(),user_id:generateId(name),city:city||'Форкляндия',joined:date,frozen:false}]);
if(error){showMsg(msg,'Ошибка: '+error.message,'error');return;}
if(balance>0)await sb.from('transactions').insert([{username:name,type:'пополнение',description:'Начальный баланс',amount:balance,date}]);
showMsg(msg,'✓ Житель "'+name+'" создан','success');showToast('✓ '+name+' создан!');
document.getElementById('newUsername').value='';document.getElementById('newPassword').value='';
document.getElementById('newBalance').value='1000';document.getElementById('newCity').value='';
}

async function adminTopup(){
const target=document.getElementById('adminTarget').value;
const amount=parseInt(document.getElementById('adminAmount').value);
const note=document.getElementById('adminNote').value.trim()||(amount>0?'Пополнение':'Списание');
const msg=document.getElementById('topupMsg');
if(!target){showMsg(msg,'Выберите жителя','error');return;}
if(!amount||amount===0){showMsg(msg,'Введите сумму','error');return;}
const btn=document.querySelector('#topupMsg+button')||document.getElementById('applyBtn');
const {data:user}=await sb.from('users').select('balance').eq('username',target).maybeSingle();
if(!user){showMsg(msg,'Не найден','error');return;}
if(amount<0&&Number(user.balance)<Math.abs(amount)){showMsg(msg,'Недостаточно средств','error');return;}
await sb.from('users').update({balance:Number(user.balance)+amount}).eq('username',target);
await sb.from('transactions').insert([{username:target,type:amount>0?'пополнение':'списание',description:note,amount,date:formatDate(new Date())}]);
showMsg(msg,'✓ Готово ('+(amount>0?'+':'')+amount+' DUM)','success');
showToast((amount>0?'💚 +':'🔴 ')+amount+' DUM → '+target);
document.getElementById('adminAmount').value='';document.getElementById('adminNote').value='';
}

async function createTask(){
const title=document.getElementById('taskTitle').value.trim();
const desc=document.getElementById('taskDesc').value.trim();
const reward=parseInt(document.getElementById('taskReward').value)||0;
const maxTakers=parseInt(document.getElementById('taskMaxTakers').value)||0;
const msg=document.getElementById('taskCreateMsg');
if(!title||!reward){showMsg(msg,'Заполните название и награду','error');return;}
const {error}=await sb.from('tasks').insert([{title,description:desc,reward,max_takers:maxTakers,active:true}]);
if(error){showMsg(msg,'Ошибка: '+error.message,'error');return;}
showMsg(msg,'✓ Задание создано','success');showToast('📋 Задание создано!');
document.getElementById('taskTitle').value='';document.getElementById('taskDesc').value='';
document.getElementById('taskReward').value='';document.getElementById('taskMaxTakers').value='';
await renderAdminTasks();
}

async function renderAdminTasks(){
const {data:tasks}=await sb.from('tasks').select('*').order('created_at',{ascending:false});
const container=document.getElementById('adminTasksList');
if(!tasks||!tasks.length){container.innerHTML='<div style="color:var(--muted);font-size:12px;text-align:center;padding:10px">Нет заданий</div>';return;}
const {data:allTakers}=await sb.from('task_takers').select('*');
const takersMap={};(allTakers||[]).forEach(t=>{if(!takersMap[t.task_id])takersMap[t.task_id]=[];takersMap[t.task_id].push(t);});
container.innerHTML=tasks.map(task=>{
const takers=takersMap[task.id]||[];
const max=task.max_takers||0;
const slots=max>0?` (${takers.length}/${max})`:(` (${takers.length})`);
const takersHTML=takers.length?takers.map(t=>`
<div class="taker-row">
<span class="taker-name">👤 ${t.username}</span>
<div style="display:flex;align-items:center;gap:5px">
<span class="taker-status ${t.status}">${t.status==='done'?'✅ Готово':'⏳ В процессе'}</span>
${t.status==='taken'?`<button class="btn-sm complete" onclick="completeTask('${task.id}','${t.username}',${task.reward})">✓ Завершить</button>`:''}
</div>
</div>`).join(''):'<div style="color:var(--muted);font-size:11px;padding:4px 0">Никто не взялся</div>';
return `<div class="admin-task-row">
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
<div class="admin-task-title">${task.title}</div>
<div style="display:flex;gap:4px;align-items:center">
<span style="font-size:12px;color:var(--neon);font-weight:700">+${task.reward} DUM</span>
<button class="btn-sm danger" onclick="deleteTask('${task.id}')">🗑</button>
</div>
</div>
${task.description?`<div style="font-size:12px;color:var(--muted);margin-bottom:4px">${task.description}</div>`:''}
<div style="font-size:11px;color:var(--muted);margin-bottom:4px">👥 Взялись${slots}${max>0?' • лимит: '+max:''}</div>
<div class="admin-task-takers">Список:</div>
${takersHTML}
</div>`;
}).join('');
}

async function completeTask(taskId,username,reward){
if(!confirm('Завершить задание для '+username+' и выплатить '+reward+' DUM?'))return;
await sb.from('task_takers').update({status:'done'}).eq('task_id',taskId).eq('username',username);
const {data:user}=await sb.from('users').select('balance').eq('username',username).maybeSingle();
await sb.from('users').update({balance:Number(user.balance)+reward}).eq('username',username);
await sb.from('transactions').insert([{username,type:'задание',description:'Награда за задание: задание #'+taskId.slice(0,6),amount:reward,date:formatDate(new Date())}]);
showToast('✅ +'+reward+' DUM → '+username);
await renderAdminTasks();
}

async function deleteTask(taskId){
if(!confirm('Удалить задание?'))return;
await sb.from('task_takers').delete().eq('task_id',taskId);
await sb.from('tasks').delete().eq('id',taskId);
showToast('🗑 Задание удалено');await renderAdminTasks();
}

async function createPromo(){
const code=document.getElementById('promoCode').value.trim().toUpperCase();
const value=parseInt(document.getElementById('promoValue').value);
const maxUses=parseInt(document.getElementById('promoUses').value)||0;
const msg=document.getElementById('promoCreateMsg');
if(!code||!value||value<=0){showMsg(msg,'Заполните код и сумму','error');return;}
const {data:ex}=await sb.from('promocodes').select('code').eq('code',code).maybeSingle();
if(ex){showMsg(msg,'Такой код уже существует','error');return;}
const {error}=await sb.from('promocodes').insert([{code,amount:value,max_uses:maxUses,used_count:0,active:true}]);
if(error){showMsg(msg,'Ошибка: '+error.message,'error');return;}
showMsg(msg,'✓ Промокод "'+code+'" создан','success');showToast('🎟️ '+code+'!');
document.getElementById('promoCode').value='';document.getElementById('promoValue').value='';
await renderPromos();
}

async function renderPromos(){
const {data}=await sb.from('promocodes').select('*').order('created_at',{ascending:false});
const list=document.getElementById('promoList');
if(!data||!data.length){list.innerHTML='<div style="color:var(--muted);font-size:12px;text-align:center;padding:10px">Нет промокодов</div>';return;}
list.innerHTML=data.map(p=>`<div class="promo-row">
<div class="promo-code-badge">${p.code}</div>
<div class="promo-info"><div style="font-size:13px;color:var(--gold);font-weight:600">+${p.amount} DUM</div><div class="promo-uses">${p.used_count}${p.max_uses>0?'/'+p.max_uses:'/∞'} исп. ${p.active?'✅':'❌'}</div></div>
<div style="display:flex;gap:4px">
<button class="btn-sm" onclick="togglePromo('${p.code}',${p.active})">${p.active?'Откл':'Вкл'}</button>
<button class="btn-sm danger" onclick="deletePromo('${p.code}')">🗑</button>
</div>
</div>`).join('');
}

async function togglePromo(code,active){
await sb.from('promocodes').update({active:!active}).eq('code',code);
showToast(active?'Промокод отключён':'Промокод включён');await renderPromos();
}
async function deletePromo(code){
if(!confirm('Удалить промокод "'+code+'"?'))return;
await sb.from('promocodes').delete().eq('code',code);
await sb.from('promo_uses').delete().eq('code',code);
await renderPromos();
}

async function toggleFreeze(username,frozen){
await sb.from('users').update({frozen:!frozen}).eq('username',username);
showToast(frozen?'✅ '+username+' разморожен':'❄️ '+username+' заморожен');
}

async function renderAdminUsers(){
const {data:users}=await sb.from('users').select('*').neq('username','admin');
const list=document.getElementById('adminUsersList');
if(!users||!users.length){list.innerHTML='<div style="color:var(--muted);font-size:12px;text-align:center;padding:10px">Нет жителей</div>';return;}
list.innerHTML=users.map(u=>`<div class="user-row ${u.frozen?'frozen-row':''}">
<div class="user-avatar-sm ${u.frozen?'frozen':''}">${u.username[0].toUpperCase()}</div>
<div class="user-info"><div class="user-name">${u.username} ${u.frozen?'❄️':''}<span style="color:var(--muted);font-size:10px;margin-left:4px">${u.city||''}</span></div><div class="user-balance-sm">${Number(u.balance||0).toLocaleString('ru-RU')} DUM</div></div>
<div class="user-actions">
<button class="btn-sm ${u.frozen?'unfreeze':'freeze'}" onclick="toggleFreeze('${u.username}',${!!u.frozen})">${u.frozen?'🔥':'❄️'}</button>
<button class="btn-sm danger" onclick="deleteUser('${u.username}')">🗑</button>
</div>
</div>`).join('');
}

async function deleteUser(name){
if(!confirm('Удалить жителя "'+name+'"?'))return;
await sb.from('transactions').delete().eq('username',name);
await sb.from('task_takers').delete().eq('username',name);
await sb.from('promo_uses').delete().eq('username',name);
await sb.from('users').delete().eq('username',name);
showToast('🗑 '+name+' удалён');
}

async function populateAdminSelect(){
const {data}=await sb.from('users').select('username,balance').neq('username','admin');
const sel=document.getElementById('adminTarget');
sel.innerHTML='<option value="">Выберите жителя...</option>';
(data||[]).forEach(u=>{const o=document.createElement('option');o.value=u.username;o.textContent=u.username+' ('+Number(u.balance).toLocaleString('ru-RU')+' DUM)';sel.appendChild(o);});
}

function switchTab(tabId,navIndex){
document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
document.getElementById(tabId).classList.add('active');
if(navIndex!==undefined)document.querySelectorAll('.nav-item').forEach((n,i)=>n.classList.toggle('active',i===navIndex));
document.getElementById('mainContent').scrollTop=0;
if(tabId==='tabBalance'){refreshBalance();renderTransactions();}
if(tabId==='tabTasks')renderTasks();
}

function showMsg(el,text,type){el.textContent=text;el.className='msg-box '+type;setTimeout(()=>{el.textContent='';el.className='msg-box';},3500);}
function updateStatusTime(){const now=new Date();document.getElementById('statusTime').textContent=now.getHours()+':'+String(now.getMinutes()).padStart(2,'0');}
setInterval(updateStatusTime,30000);
init();
