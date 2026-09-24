import webpush from 'web-push';
export interface Env{DB:D1Database;DOCS:R2Bucket;APP_URL:string;TIMEZONE:string;ALERT_HOURS:string;DISCORD_CLIENT_ID:string;DISCORD_CLIENT_SECRET:string;DISCORD_REDIRECT_URI:string;DISCORD_WEBHOOK_URL?:string;DISCORD_WEBHOOK_LOMBARD?:string;DISCORD_WEBHOOK_LOMBARD_2?:string;DISCORD_WEBHOOK_ZAGRODY?:string;DISCORD_WEBHOOK_POLA?:string;DISCORD_WEBHOOK_MOTORS?:string;DISCORD_WEBHOOK_GARAGE?:string;DISCORD_WEBHOOK_GARAGE_2?:string;DISCORD_WEBHOOK_CONTRACTS?:string;ADMIN_DISCORD_ID:string;SESSION_SECRET:string;VAPID_PUBLIC_KEY:string;VAPID_PRIVATE_KEY:string;VAPID_SUBJECT:string}
const security={'x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'geolocation=(), camera=(), microphone=()','cache-control':'no-store'};
const json=(data:any,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8',...security,...headers}});
const cors=(env:Env)=>({'access-control-allow-origin':env.APP_URL,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS'});
const token=()=>crypto.randomUUID()+crypto.randomUUID();
async function me(req:Request,env:Env){const t=(req.headers.get('cookie')||'').match(/am_session=([^;]+)/)?.[1];if(!t)return null;return await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>datetime('now')").bind(t).first<any>()}
async function body(req:Request){try{return await req.json<any>()}catch{return {}}}
async function audit(env:Env,u:any,action:string,type?:string,id?:any,payload?:any){await env.DB.prepare("INSERT INTO activity_log(user_id,action,entity_type,entity_id,payload) VALUES(?,?,?,?,?)").bind(u?.id||null,action,type||null,id?String(id):null,payload?JSON.stringify(payload):null).run()}
const webhookFor=(env:Env,category?:string)=>category==='Lombard'?env.DISCORD_WEBHOOK_LOMBARD:category==='Zagroda'?env.DISCORD_WEBHOOK_ZAGRODY:category==='Pole'?env.DISCORD_WEBHOOK_POLA:category==='LS Motors'?env.DISCORD_WEBHOOK_MOTORS:category==='Mechanik'?env.DISCORD_WEBHOOK_GARAGE:env.DISCORD_WEBHOOK_URL;
const webhookForSlot=(env:Env,slot?:string|null,category?:string)=>slot==='lombard_2'?env.DISCORD_WEBHOOK_LOMBARD_2:slot==='garage_2'?env.DISCORD_WEBHOOK_GARAGE_2:slot==='lombard_1'?env.DISCORD_WEBHOOK_LOMBARD:slot==='garage_1'?env.DISCORD_WEBHOOK_GARAGE:slot==='pola'?env.DISCORD_WEBHOOK_POLA:slot==='zagrody'?env.DISCORD_WEBHOOK_ZAGRODY:slot==='motors'?env.DISCORD_WEBHOOK_MOTORS:webhookFor(env,category);
async function discordSend(env:Env,content:string,webhook?:string){const url=webhook||env.DISCORD_WEBHOOK_URL;if(!url)return null;const r=await fetch(url+'?wait=true',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:['roles']}})});if(!r.ok)throw new Error('Discord '+r.status);return await r.json<any>()}
async function discordDelete(env:Env,id?:string,webhook?:string){const url=webhook||env.DISCORD_WEBHOOK_URL;if(!id||!url)return;await fetch(url+'/messages/'+id,{method:'DELETE'}).catch(()=>{})}
async function pushAll(env:Env,title:string,bodyText:string){if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return;webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);const {results}=await env.DB.prepare("SELECT * FROM push_subscriptions").all<any>();for(const s of results){try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify({title,body:bodyText,url:env.APP_URL}))}catch(e:any){if(e?.statusCode===404||e?.statusCode===410)await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(s.id).run()}}}
function zonedEpoch(value:string,timeZone:string){
 if(!value)return NaN;
 if(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value))return new Date(value).getTime();
 const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
 if(!m)return new Date(value).getTime();
 const base=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
 let instant=base;
 for(let i=0;i<2;i++){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const get=(t:string)=>Number(parts.find(p=>p.type===t)?.value||0);
  const rendered=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
  instant=base-(rendered-instant)
 }
 return instant
}
function formatInZone(value:string,timeZone:string){
 const ts=zonedEpoch(value,timeZone);
 if(!Number.isFinite(ts))return value;
 return new Intl.DateTimeFormat('pl-PL',{timeZone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ts))
}
function takeoverWarning(category?:string){
 const label=category==='Pole'?'pole':category==='Zagroda'?'zagrodę':category==='Lombard'?'lombard':category==='LS Motors'?'salon':category==='Mechanik'?'warsztat':'obiekt';
 return '⚠️ **BRAK PRZEDŁUŻENIA = RYZYKO UTRATY**\\nPo upływie terminu inny gracz może przejąć '+label+'.'
}
async function ensureEventSettings(env:Env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS calendar_event_settings(event_id INTEGER PRIMARY KEY,notification_category TEXT,reminder_hours TEXT NOT NULL DEFAULT '72,24,12,6,1',discord_role_id TEXT,enabled INTEGER NOT NULL DEFAULT 0,last_threshold INTEGER,discord_message_id TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(event_id) REFERENCES calendar_events(id))").run()
}
async function ensureAssetSettings(env:Env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS asset_alert_settings(asset_id INTEGER PRIMARY KEY,reminder_hours TEXT NOT NULL DEFAULT '72,24,12,6,1',webhook_slot TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(asset_id) REFERENCES assets(id))").run();
 const info=await env.DB.prepare("PRAGMA table_info(asset_alert_settings)").all<any>();
 if(!(info.results||[]).some((x:any)=>x.name==='webhook_slot'))await env.DB.prepare("ALTER TABLE asset_alert_settings ADD COLUMN webhook_slot TEXT").run()
}
async function ensureNotificationReads(env:Env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS notification_reads(user_id INTEGER NOT NULL,notification_id INTEGER NOT NULL,read_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,notification_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(notification_id) REFERENCES notifications(id))").run()
}
function remainingLabel(ms:number){
 const total=Math.max(0,Math.floor(ms/60000)),days=Math.floor(total/1440),hours=Math.floor((total%1440)/60),mins=total%60;
 if(days)return days+' d '+hours+' h';
 if(hours)return hours+' h '+mins+' min';
 return mins+' min'
}
function assetDiscordText(a:any,env:Env,threshold?:number,test=false){
 const expires=zonedEpoch(a.expires_at,env.TIMEZONE||'Europe/Warsaw'),unix=Math.floor(expires/1000),left=expires-Date.now();
 const role=a.discord_role_id?'<@&'+a.discord_role_id+'>':'';
 const title=a.category==='Pole'?'POLE WYGASA':a.category==='Zagroda'?'ZAGRODA WYGASA':a.category==='Lombard'?'LOMBARD WYGASA':a.category==='LS Motors'?'ARABIC MOTORS WYGASA':a.category==='Mechanik'?'MECHANIK WYGASA':'TERMIN WYGASA';
 const icon=left<=6*36e5?'🚨':'⚠️';
 const lines:string[]=[];
 if(role)lines.push(role);
 lines.push(icon+' **'+title+'**');
 lines.push('**'+a.name+'**');
 lines.push('');
 lines.push('⏳ **Pozostało:** '+remainingLabel(left));
 lines.push('📅 **Termin:** <t:'+unix+':F>');
 if(threshold)lines.push('🔔 **Próg alertu:** '+remainingLabel(threshold*36e5));
 if(test)lines.push('🧪 *Wiadomość testowa*');
 if(test&&!a.discord_role_id)lines.push('⚠️ *Brak ID roli Discord dla tego terminu, więc rola nie została oznaczona.*');
 lines.push('');
 lines.push('❗ **BRAK PRZEDŁUŻENIA = RYZYKO UTRATY**');
 lines.push(takeoverWarning(a.category).replace('⚠️ **BRAK PRZEDŁUŻENIA = RYZYKO UTRATY**\\n',''));
 return lines.join('\n')
}

function normalizeHours(value:any){
 const raw=String(value||'72,24,12,6,1').split(',').map((x:string)=>Number(x.trim())).filter((x:number)=>Number.isFinite(x)&&x>0&&x<=8760);
 return [...new Set(raw)].sort((a:number,b:number)=>b-a).join(',')||'72,24,12,6,1'
}
async function alerts(env:Env){
 await ensureEventSettings(env);
 await ensureAssetSettings(env);
 const {results}=await env.DB.prepare("SELECT a.*,COALESCE(cfg.reminder_hours,?) reminder_hours,cfg.webhook_slot,s.last_threshold,s.discord_message_id FROM assets a LEFT JOIN asset_alert_settings cfg ON cfg.asset_id=a.id LEFT JOIN alert_state s ON s.asset_id=a.id WHERE a.active=1 AND a.deleted_at IS NULL").bind(env.ALERT_HOURS||'72,24,12,6,1').all<any>();
 for(const a of results){
  const hs=normalizeHours(a.reminder_hours||env.ALERT_HOURS).split(',').map(Number);
  const expires=zonedEpoch(a.expires_at,env.TIMEZONE||'Europe/Warsaw');
  if(!Number.isFinite(expires)||expires<=Date.now())continue;
  const left=(expires-Date.now())/36e5;
  const th=[...hs].reverse().find(h=>left<=h);
  if(th==null||a.last_threshold===th)continue;
  const hook=webhookForSlot(env,a.webhook_slot,a.category);
  await discordDelete(env,a.discord_message_id,hook);
  const text=assetDiscordText(a,env,th);
  const msg=await discordSend(env,text,hook);
  await env.DB.prepare("INSERT INTO alert_state(asset_id,last_threshold,discord_message_id,last_sent_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(asset_id) DO UPDATE SET last_threshold=excluded.last_threshold,discord_message_id=excluded.discord_message_id,last_sent_at=CURRENT_TIMESTAMP").bind(a.id,th,msg?.id||null).run();
  await env.DB.prepare("INSERT INTO notifications(title,body) VALUES(?,?)").bind(a.name,'Termin za około '+th+'h. Brak przedłużenia grozi utratą.').run();
  await pushAll(env,a.name,'Zostało około '+th+'h. Brak przedłużenia może oznaczać przejęcie przez innego gracza.')
 }

 const ev=await env.DB.prepare("SELECT e.id,e.title,e.starts_at,s.notification_category,s.reminder_hours,s.discord_role_id,s.enabled,s.last_threshold,s.discord_message_id FROM calendar_events e JOIN calendar_event_settings s ON s.event_id=e.id WHERE e.deleted_at IS NULL AND s.enabled=1").all<any>();
 for(const e of ev.results){
  const hours=normalizeHours(e.reminder_hours).split(',').map(Number);
  const starts=zonedEpoch(e.starts_at,env.TIMEZONE||'Europe/Warsaw');
  if(!Number.isFinite(starts)||starts<=Date.now())continue;
  const left=(starts-Date.now())/36e5;
  const th=[...hours].reverse().find((h:number)=>left<=h);
  if(th==null||e.last_threshold===th)continue;
  const hook=webhookFor(env,e.notification_category);
  if(!hook)continue;
  await discordDelete(env,e.discord_message_id,hook);
  const role=e.discord_role_id?'<@&'+e.discord_role_id+'> ':'',unix=Math.floor(starts/1000);
  const text=role+'📅 **'+e.title+'**\\n**Pozostało:** '+remainingLabel(starts-Date.now())+' • <t:'+unix+':R>\\n**Termin:** <t:'+unix+':F>\\n**Próg alertu:** '+th+' h';
  const msg=await discordSend(env,text,hook);
  await env.DB.prepare("UPDATE calendar_event_settings SET last_threshold=?,discord_message_id=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=?").bind(th,msg?.id||null,e.id).run();
  await env.DB.prepare("INSERT INTO notifications(title,body) VALUES(?,?)").bind(e.title,'Wydarzenie za około '+th+'h').run();
  await pushAll(env,e.title,'Wydarzenie za około '+th+'h')
 }
}
async function api(req:Request,env:Env):Promise<Response>{const url=new URL(req.url),p=url.pathname;if(req.method==='OPTIONS')return new Response(null,{headers:{...security,...cors(env)}});const len=Number(req.headers.get('content-length')||0);if(len>8*1024*1024)return json({error:'Żądanie jest za duże'},413,cors(env));if(p.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.get('origin')!==env.APP_URL)return json({error:'Nieprawidłowe źródło żądania'},403,cors(env));
if(p==='/health')return json({ok:true,time:new Date().toISOString()});
if(p==='/auth/discord'){const state=token();const q=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:'code',redirect_uri:env.DISCORD_REDIRECT_URI,scope:'identify',state});return new Response(null,{status:302,headers:{location:'https://discord.com/oauth2/authorize?'+q,'set-cookie':'oauth_state='+state+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600'}})}
if(p==='/auth/discord/callback'){const code=url.searchParams.get('code'),state=url.searchParams.get('state'),saved=(req.headers.get('cookie')||'').match(/oauth_state=([^;]+)/)?.[1];if(!code||!state||state!==saved)return json({error:'Nieprawidłowy OAuth state'},400);const form=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:env.DISCORD_REDIRECT_URI});const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});const td=await tr.json<any>();if(!td.access_token)return json({error:'OAuth failed'},401);const dr=await fetch('https://discord.com/api/users/@me',{headers:{authorization:'Bearer '+td.access_token}});const d=await dr.json<any>();const role=d.id===env.ADMIN_DISCORD_ID?'admin':'member',status='active';await env.DB.prepare("INSERT INTO users(discord_id,discord_name,avatar,role,status) VALUES(?,?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET discord_name=excluded.discord_name,avatar=excluded.avatar,role=excluded.role,status=excluded.status,updated_at=CURRENT_TIMESTAMP").bind(d.id,d.username,d.avatar,role,status).run();const u=await env.DB.prepare("SELECT * FROM users WHERE discord_id=?").bind(d.id).first<any>();const st=token(),exp=new Date(Date.now()+30*864e5).toISOString();await env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)").bind(st,u.id,exp).run();return new Response(null,{status:302,headers:{location:env.APP_URL,'set-cookie':'am_session='+st+'; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000'}})}
const u=await me(req,env);if(!u)return json({error:'UNAUTHORIZED'},401,cors(env));if(u.status!=='active'&&p!=='/api/me')return json({error:'PENDING'},403,cors(env));
if(p==='/api/me')return json(u,200,cors(env));
if(p==='/api/characters/claim'&&req.method==='POST'){
 if(u.character_name)return json({error:'Postać jest już przypisana do tego konta'},409,cors(env));
 const b=await body(req),name=String(b.character_name||'').trim().replace(/\s+/g,' ');
 if(name.length<3||name.length>60||!/^[-A-Za-zÀ-ž' ]+$/.test(name)||name.split(' ').length<2)return json({error:'Wpisz imię i nazwisko postaci'},400,cors(env));
 try{await env.DB.prepare("UPDATE users SET character_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND character_name IS NULL").bind(name,u.id).run()}catch{return json({error:'Ta postać została już zajęta'},409,cors(env))}
 const fresh=await env.DB.prepare("SELECT character_name FROM users WHERE id=?").bind(u.id).first<any>();
 if(fresh?.character_name!==name)return json({error:'Nie udało się przypisać postaci'},409,cors(env));
 await env.DB.prepare("INSERT OR IGNORE INTO money_balances(owner,clean,dirty) VALUES(?,0,0)").bind(name).run();
 await audit(env,u,'claim_character','user',u.id,{character_name:name});
 return json({ok:true,character_name:name},200,cors(env))
}
if(p==='/api/onboarding/complete'&&req.method==='POST'){await env.DB.prepare("UPDATE users SET onboarding_completed=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(u.id).run();await audit(env,u,'complete_onboarding','user',u.id);return json({ok:true},200,cors(env))}
if(p==='/api/bootstrap'&&req.method==='GET'){await ensureEventSettings(env);await ensureAssetSettings(env);await ensureNotificationReads(env);await env.DB.prepare("INSERT OR IGNORE INTO money_balances(owner,clean,dirty) SELECT character_name,0,0 FROM users WHERE character_name IS NOT NULL").run();const moneyQ=u.role==='admin'?env.DB.prepare("SELECT mb.* FROM money_balances mb WHERE mb.owner<>'Wspólne' AND EXISTS(SELECT 1 FROM users x WHERE x.character_name=mb.owner) ORDER BY mb.owner"):env.DB.prepare("SELECT * FROM money_balances WHERE owner=?").bind(u.character_name);const [assets,money,events,sales,notifications]=await Promise.all([env.DB.prepare("SELECT a.*,COALESCE(cfg.reminder_hours,?) reminder_hours,cfg.webhook_slot FROM assets a LEFT JOIN asset_alert_settings cfg ON cfg.asset_id=a.id WHERE a.deleted_at IS NULL ORDER BY a.expires_at").bind(env.ALERT_HOURS||'72,24,12,6,1').all(),moneyQ.all(),env.DB.prepare("SELECT e.*,s.notification_category,s.reminder_hours,s.discord_role_id,COALESCE(s.enabled,0) reminder_enabled FROM calendar_events e LEFT JOIN calendar_event_settings s ON s.event_id=e.id WHERE e.deleted_at IS NULL ORDER BY e.starts_at").all(),env.DB.prepare("SELECT s.*,p.name buyer_name,p.cid FROM sales s JOIN players p ON p.id=s.player_id WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC").all(),env.DB.prepare("SELECT n.*,nr.read_at user_read_at FROM notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=? WHERE n.user_id IS NULL OR n.user_id=? ORDER BY n.created_at DESC LIMIT 50").bind(u.id,u.id).all()]);const moneyRows:any[]=money.results as any[];if(u.role==='admin'){const shared=moneyRows.reduce((a:any,x:any)=>({clean:a.clean+Number(x.clean||0),dirty:a.dirty+Number(x.dirty||0)}),{clean:0,dirty:0});moneyRows.push({owner:'Wspólne',clean:shared.clean,dirty:shared.dirty,computed:1})}return json({user:u,assets:assets.results,money:moneyRows,events:events.results,sales:sales.results,notifications:notifications.results},200,cors(env))}
if(p==='/api/assets'&&req.method==='POST'){await ensureAssetSettings(env);const b=await body(req);const allowed=['Pole','Zagroda','Lombard','LS Motors','Mechanik'];if(!b.name||String(b.name).length>80||!allowed.includes(b.category)||!b.expires_at||isNaN(Date.parse(b.expires_at)))return json({error:'Nieprawidłowe dane'},400,cors(env));const r=await env.DB.prepare("INSERT INTO assets(name,category,expires_at,discord_role_id,created_by) VALUES(?,?,?,?,?)").bind(b.name,b.category,b.expires_at,b.discord_role_id||null,u.id).run();const id=Number(r.meta.last_row_id);await env.DB.prepare("INSERT INTO asset_alert_settings(asset_id,reminder_hours,webhook_slot) VALUES(?,?,?)").bind(id,normalizeHours(b.reminder_hours||env.ALERT_HOURS),String(b.webhook_slot||'')||null).run();await audit(env,u,'create','asset',id,b);return json({ok:true,id},201,cors(env))}
const am=p.match(/^\/api\/assets\/(\d+)\/renew$/);if(am&&req.method==='POST'){await ensureAssetSettings(env);const id=+am[1],b=await body(req),a=await env.DB.prepare("SELECT * FROM assets WHERE id=?").bind(id).first<any>();if(!a)return json({error:'Nie znaleziono'},404,cors(env));const hours=normalizeHours(b.reminder_hours||env.ALERT_HOURS),cfg=await env.DB.prepare("SELECT webhook_slot FROM asset_alert_settings WHERE asset_id=?").bind(id).first<any>(),slot=String(b.webhook_slot||cfg?.webhook_slot||'')||null;await env.DB.batch([env.DB.prepare("INSERT INTO renewals(asset_id,old_expires_at,new_expires_at,cost,user_id) VALUES(?,?,?,?,?)").bind(id,a.expires_at,b.expires_at,Number(b.cost)||0,u.id),env.DB.prepare("UPDATE assets SET expires_at=?,discord_role_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.expires_at,b.discord_role_id||null,id),env.DB.prepare("INSERT INTO asset_alert_settings(asset_id,reminder_hours,webhook_slot,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(asset_id) DO UPDATE SET reminder_hours=excluded.reminder_hours,webhook_slot=excluded.webhook_slot,updated_at=CURRENT_TIMESTAMP").bind(id,hours,slot)]);const st=await env.DB.prepare("SELECT discord_message_id FROM alert_state WHERE asset_id=?").bind(id).first<any>();await discordDelete(env,st?.discord_message_id,webhookForSlot(env,cfg?.webhook_slot,a.category));await env.DB.prepare("DELETE FROM alert_state WHERE asset_id=?").bind(id).run();await audit(env,u,'renew','asset',id,b);return json({ok:true},200,cors(env))}
const aam=p.match(/^\/api\/assets\/(\d+)\/alerts$/);if(aam&&req.method==='PUT'){await ensureAssetSettings(env);const id=+aam[1],b=await body(req),a=await env.DB.prepare("SELECT * FROM assets WHERE id=? AND deleted_at IS NULL").bind(id).first<any>();if(!a)return json({error:'Nie znaleziono terminu'},404,cors(env));const oldCfg=await env.DB.prepare("SELECT webhook_slot FROM asset_alert_settings WHERE asset_id=?").bind(id).first<any>(),hours=normalizeHours(b.reminder_hours||env.ALERT_HOURS),role=String(b.discord_role_id||'').trim()||null,slot=String(b.webhook_slot||'').trim()||null;const st=await env.DB.prepare("SELECT discord_message_id FROM alert_state WHERE asset_id=?").bind(id).first<any>();await discordDelete(env,st?.discord_message_id,webhookForSlot(env,oldCfg?.webhook_slot,a.category));await env.DB.batch([env.DB.prepare("UPDATE assets SET discord_role_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(role,id),env.DB.prepare("INSERT INTO asset_alert_settings(asset_id,reminder_hours,webhook_slot,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(asset_id) DO UPDATE SET reminder_hours=excluded.reminder_hours,webhook_slot=excluded.webhook_slot,updated_at=CURRENT_TIMESTAMP").bind(id,hours,slot),env.DB.prepare("DELETE FROM alert_state WHERE asset_id=?").bind(id)]);await audit(env,u,'update_alerts','asset',id,{reminder_hours:hours,discord_role_id:role,webhook_slot:slot});return json({ok:true,reminder_hours:hours,discord_role_id:role,webhook_slot:slot},200,cors(env))}

const atm=p.match(/^\/api\/assets\/(\d+)\/test-alert$/);if(atm&&req.method==='POST'){await ensureAssetSettings(env);if(u.role!=='admin')return json({error:'FORBIDDEN'},403,cors(env));const id=+atm[1],a=await env.DB.prepare("SELECT a.*,cfg.webhook_slot,cfg.reminder_hours FROM assets a LEFT JOIN asset_alert_settings cfg ON cfg.asset_id=a.id WHERE a.id=? AND a.deleted_at IS NULL").bind(id).first<any>();if(!a)return json({error:'Nie znaleziono terminu'},404,cors(env));const hook=webhookForSlot(env,a.webhook_slot,a.category);if(!hook)return json({error:'Dla tego kanału nie ustawiono webhooka w Cloudflare'},400,cors(env));await discordSend(env,assetDiscordText(a,env,undefined,true),hook);return json({ok:true},200,cors(env))}
if(p==='/api/money'&&req.method==='POST'){const b=await body(req),owner=String(b.owner||'');if(owner==='Wspólne')return json({error:'Wspólne jest sumą wszystkich postaci i nie można go edytować ręcznie'},400,cors(env));if(u.role!=='admin'&&owner!==u.character_name)return json({error:'Możesz edytować tylko własne pieniądze'},403,cors(env));const old=await env.DB.prepare("SELECT * FROM money_balances WHERE owner=?").bind(owner).first<any>();if(!old)return json({error:'Nieznany właściciel'},400,cors(env));await env.DB.batch([env.DB.prepare("INSERT INTO money_log(owner,old_clean,old_dirty,new_clean,new_dirty,user_id) VALUES(?,?,?,?,?,?)").bind(owner,old.clean,old.dirty,Number(b.clean)||0,Number(b.dirty)||0,u.id),env.DB.prepare("UPDATE money_balances SET clean=?,dirty=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE owner=?").bind(Number(b.clean)||0,Number(b.dirty)||0,u.id,owner)]);return json({ok:true},200,cors(env))}
if(p==='/api/money/undo'&&req.method==='POST'){const q=u.role==='admin'?env.DB.prepare("SELECT * FROM money_log WHERE undone=0 ORDER BY id DESC LIMIT 1"):env.DB.prepare("SELECT * FROM money_log WHERE undone=0 AND owner=? ORDER BY id DESC LIMIT 1").bind(u.character_name);const l=await q.first<any>();if(!l)return json({error:'Brak zmian'},404,cors(env));await env.DB.batch([env.DB.prepare("UPDATE money_balances SET clean=?,dirty=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE owner=?").bind(l.old_clean,l.old_dirty,u.id,l.owner),env.DB.prepare("UPDATE money_log SET undone=1 WHERE id=?").bind(l.id)]);return json({ok:true},200,cors(env))}
if(p==='/api/events'&&req.method==='POST'){await ensureEventSettings(env);const b=await body(req);if(!b.title||!b.starts_at||isNaN(Date.parse(b.starts_at)))return json({error:'Nazwa i data są wymagane'},400,cors(env));const r=await env.DB.prepare("INSERT INTO calendar_events(title,starts_at,ends_at,created_by) VALUES(?,?,?,?)").bind(String(b.title).slice(0,120),b.starts_at,b.ends_at||null,u.id).run();const id=Number(r.meta.last_row_id),enabled=b.reminder_enabled?1:0,category=String(b.notification_category||'');await env.DB.prepare("INSERT INTO calendar_event_settings(event_id,notification_category,reminder_hours,discord_role_id,enabled) VALUES(?,?,?,?,?)").bind(id,category||null,normalizeHours(b.reminder_hours),b.discord_role_id||null,enabled).run();await audit(env,u,'create','calendar_event',id,b);return json({ok:true,id},201,cors(env))}
const em=p.match(/^\/api\/events\/(\d+)$/);
if(em&&req.method==='PUT'){await ensureEventSettings(env);const id=+em[1],b=await body(req),ev=await env.DB.prepare("SELECT e.*,s.notification_category old_category,s.discord_message_id FROM calendar_events e LEFT JOIN calendar_event_settings s ON s.event_id=e.id WHERE e.id=? AND e.deleted_at IS NULL").bind(id).first<any>();if(!ev)return json({error:'Nie znaleziono wpisu'},404,cors(env));if(!b.title||!b.starts_at||isNaN(Date.parse(b.starts_at)))return json({error:'Nazwa i data są wymagane'},400,cors(env));await discordDelete(env,ev.discord_message_id,webhookFor(env,ev.old_category));await env.DB.batch([env.DB.prepare("UPDATE calendar_events SET title=?,starts_at=?,ends_at=? WHERE id=?").bind(String(b.title).slice(0,120),b.starts_at,b.ends_at||null,id),env.DB.prepare("INSERT INTO calendar_event_settings(event_id,notification_category,reminder_hours,discord_role_id,enabled,last_threshold,discord_message_id,updated_at) VALUES(?,?,?,?,?,NULL,NULL,CURRENT_TIMESTAMP) ON CONFLICT(event_id) DO UPDATE SET notification_category=excluded.notification_category,reminder_hours=excluded.reminder_hours,discord_role_id=excluded.discord_role_id,enabled=excluded.enabled,last_threshold=NULL,discord_message_id=NULL,updated_at=CURRENT_TIMESTAMP").bind(id,String(b.notification_category||'')||null,normalizeHours(b.reminder_hours),b.discord_role_id||null,b.reminder_enabled?1:0)]);await audit(env,u,'update','calendar_event',id,b);return json({ok:true},200,cors(env))}
if(em&&req.method==='DELETE'){await ensureEventSettings(env);const id=+em[1],ev=await env.DB.prepare("SELECT e.*,s.notification_category,s.discord_message_id FROM calendar_events e LEFT JOIN calendar_event_settings s ON s.event_id=e.id WHERE e.id=? AND e.deleted_at IS NULL").bind(id).first<any>();if(!ev)return json({error:'Nie znaleziono wpisu'},404,cors(env));await discordDelete(env,ev.discord_message_id,webhookFor(env,ev.notification_category));await env.DB.prepare("UPDATE calendar_events SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();await audit(env,u,'delete','calendar_event',id);return json({ok:true},200,cors(env))}
if(p==='/api/sales'&&req.method==='POST'){
 const fd=await req.formData();
 const cid=String(fd.get('cid')||''),name=String(fd.get('buyer_name')||'');
 if(!cid||!name)return json({error:'CID i kupujący są wymagani'},400,cors(env));
 await env.DB.prepare("INSERT INTO players(cid,name) VALUES(?,?) ON CONFLICT(cid) DO UPDATE SET name=excluded.name,updated_at=CURRENT_TIMESTAMP").bind(cid,name).run();
 const pl=await env.DB.prepare("SELECT id FROM players WHERE cid=?").bind(cid).first<any>();
 const count=await env.DB.prepare("SELECT COUNT(*) c FROM sales WHERE strftime('%Y',created_at)=strftime('%Y','now')").first<any>();
 const no='LSM/'+new Date().getFullYear()+'/'+String((count?.c||0)+1).padStart(4,'0');
 let key:string|null=null;
 const file=fd.get('document');
 if(file instanceof File&&file.size){
  if(file.size>7*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type))return json({error:'Dozwolone są PDF/JPG/PNG do 7 MB'},400,cors(env));
  key='contracts/'+no.replaceAll('/','-')+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  await env.DOCS.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}})
 }
 const vehicle=String(fd.get('vehicle_name')||''),registration=String(fd.get('registration')||''),purchaseDate=String(fd.get('purchase_date')||''),price=Number(fd.get('price'))||0,payment=String(fd.get('payment_method')||'Gotówka'),extra=String(fd.get('extra_terms')||'');
 await env.DB.prepare("INSERT INTO sales(contract_no,player_id,vehicle_name,registration,purchase_date,price,payment_method,extra_terms,seller_user_id,document_key) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(no,pl.id,vehicle,registration,purchaseDate,price,payment,extra,u.id,key).run();
 if(env.DISCORD_WEBHOOK_CONTRACTS){
  const contractText=[
   '📄 **Nowa umowa LS Motors**',
   '**'+no+'** • '+name+' (CID '+cid+')',
   'Pojazd: **'+vehicle+'** • Rejestracja: **'+registration+'**',
   'Cena: **$'+price.toLocaleString('en-US')+'**'
  ].join('\n');
  await discordSend(env,contractText,env.DISCORD_WEBHOOK_CONTRACTS).catch(()=>{})
 }
 return json({ok:true,contract_no:no},201,cors(env))
}
const spm=p.match(/^\/api\/sales\/(\d+)\/price$/);if(spm&&req.method==='PUT'){const id=+spm[1],b=await body(req),price=Number(b.price);if(!Number.isFinite(price)||price<0||price>999999999)return json({error:'Nieprawidłowa cena'},400,cors(env));const sale=await env.DB.prepare("SELECT id,price,contract_no FROM sales WHERE id=? AND deleted_at IS NULL").bind(id).first<any>();if(!sale)return json({error:'Nie znaleziono sprzedaży'},404,cors(env));await env.DB.prepare("UPDATE sales SET price=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(Math.round(price),id).run();await audit(env,u,'update_price','sale',id,{old_price:sale.price,new_price:Math.round(price),contract_no:sale.contract_no});return json({ok:true,price:Math.round(price)},200,cors(env))}
const sdm=p.match(/^\/api\/sales\/(\d+)\/document$/);if(sdm&&req.method==='POST'){const id=+sdm[1],sale=await env.DB.prepare("SELECT id,contract_no,document_key FROM sales WHERE id=? AND deleted_at IS NULL").bind(id).first<any>();if(!sale)return json({error:'Nie znaleziono sprzedaży'},404,cors(env));const fd=await req.formData(),file=fd.get('document');if(!(file instanceof File)||!file.size)return json({error:'Wybierz plik umowy'},400,cors(env));if(file.size>7*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type))return json({error:'Dozwolone są PDF/JPG/PNG do 7 MB'},400,cors(env));const key='contracts/'+String(sale.contract_no).replaceAll('/','-')+'-'+Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');await env.DOCS.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});await env.DB.prepare("UPDATE sales SET document_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(key,id).run();if(sale.document_key&&sale.document_key!==key)await env.DOCS.delete(sale.document_key).catch(()=>{});await audit(env,u,'replace_document','sale',id,{old:sale.document_key,new:key});return json({ok:true,document_key:key},200,cors(env))}
const pm=p.match(/^\/api\/players\/([^/]+)$/);if(pm){const cid=decodeURIComponent(pm[1]);const player=await env.DB.prepare("SELECT * FROM players WHERE cid=?").bind(cid).first<any>();if(!player)return json({error:'Nie znaleziono'},404,cors(env));if(req.method==='PUT'){const b=await body(req),nextCid=String(b.cid||cid).trim(),nextName=String(b.name||'').trim();if(!nextCid||!nextName||nextCid.length>40||nextName.length>100)return json({error:'Nieprawidłowe dane gracza'},400,cors(env));try{await env.DB.prepare("UPDATE players SET cid=?,name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(nextCid,nextName,player.id).run()}catch{return json({error:'Ten CID jest już przypisany do innego gracza'},409,cors(env))}await audit(env,u,'update','player',player.id,{old_cid:cid,cid:nextCid,name:nextName});const fresh=await env.DB.prepare("SELECT * FROM players WHERE id=?").bind(player.id).first<any>();const sales=await env.DB.prepare("SELECT * FROM sales WHERE player_id=? AND deleted_at IS NULL ORDER BY purchase_date DESC,created_at DESC").bind(player.id).all();return json({player:fresh,sales:sales.results},200,cors(env))}if(req.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405,cors(env));const sales=await env.DB.prepare("SELECT * FROM sales WHERE player_id=? AND deleted_at IS NULL ORDER BY purchase_date DESC,created_at DESC").bind(player.id).all();return json({player,sales:sales.results},200,cors(env))}
const dm=p.match(/^\/api\/documents\/(\d+)$/);if(dm){const s=await env.DB.prepare("SELECT document_key FROM sales WHERE id=?").bind(+dm[1]).first<any>();if(!s?.document_key)return json({error:'Brak dokumentu'},404,cors(env));const o=await env.DOCS.get(s.document_key);if(!o)return json({error:'Brak pliku'},404,cors(env));return new Response(o.body,{headers:{...security,'content-type':o.httpMetadata?.contentType||'application/octet-stream','content-disposition':'inline','x-frame-options':'SAMEORIGIN'}})}
if(p==='/api/notifications/read-all'&&req.method==='POST'){await ensureNotificationReads(env);await env.DB.prepare("INSERT OR REPLACE INTO notification_reads(user_id,notification_id,read_at) SELECT ?,id,CURRENT_TIMESTAMP FROM notifications WHERE user_id IS NULL OR user_id=?").bind(u.id,u.id).run();return json({ok:true},200,cors(env))}
if(p==='/api/push/subscribe'&&req.method==='POST'){const b=await body(req);await env.DB.prepare("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth").bind(u.id,b.endpoint,b.keys?.p256dh,b.keys?.auth).run();return json({ok:true},200,cors(env))}
if(p==='/api/admin/test-discord'&&req.method==='POST'){if(u.role!=='admin')return json({error:'FORBIDDEN'},403,cors(env));const hooks=[['Lombard 1',env.DISCORD_WEBHOOK_LOMBARD],['Lombard 2',env.DISCORD_WEBHOOK_LOMBARD_2],['Zagrody',env.DISCORD_WEBHOOK_ZAGRODY],['Pola',env.DISCORD_WEBHOOK_POLA],['Arabic Motors',env.DISCORD_WEBHOOK_MOTORS],['Mechanik 1',env.DISCORD_WEBHOOK_GARAGE],['Mechanik 2',env.DISCORD_WEBHOOK_GARAGE_2],['Umowy Arabic Motors',env.DISCORD_WEBHOOK_CONTRACTS],['Ogólny',env.DISCORD_WEBHOOK_URL]].filter((x:any)=>x[1]);if(!hooks.length)return json({error:'Brak skonfigurowanych webhooków'},400,cors(env));try{for(const [name,hook] of hooks as any[])await discordSend(env,'🧪 **Holdings Panel**\\nTest webhooka: **'+name+'**',hook);return json({ok:true,count:hooks.length},200,cors(env))}catch{return json({error:'Jeden z webhooków Discord nie odpowiedział poprawnie'},502,cors(env))}}
if(p==='/api/admin/users'&&u.role==='admin'){if(req.method==='GET'){const x=await env.DB.prepare("SELECT id,discord_id,discord_name,character_name,role,status FROM users ORDER BY created_at DESC").all();return json(x.results,200,cors(env))}if(req.method==='POST'){const b=await body(req);await env.DB.prepare("UPDATE users SET character_name=?,role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.character_name,b.role||'member',b.status||'active',b.id).run();return json({ok:true},200,cors(env))}}
if(p==='/api/export'&&u.role==='admin'){const data:any={};for(const t of ['users','assets','renewals','money_balances','money_log','calendar_events','players','sales','activity_log'])data[t]=(await env.DB.prepare('SELECT * FROM '+t).all()).results;return json(data,200,{...cors(env),'content-disposition':'attachment; filename=holdings-panel-export.json'})}
return json({error:'NOT_FOUND'},404,cors(env))}
export default{fetch:api,async scheduled(_c:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(alerts(env))}};
