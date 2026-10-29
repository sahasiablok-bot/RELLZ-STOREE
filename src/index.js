const SERVICE_NAME = "JASA JOKI KONTAK";
const PRICES = {1:2000,2:4000,3:6000,4:8000,5:10000};

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const isProd=env=>env.MIDTRANS_IS_PRODUCTION==="true";
const midBase=env=>isProd(env)?"https://app.midtrans.com":"https://app.sandbox.midtrans.com";
const apiBase=env=>isProd(env)?"https://api.midtrans.com":"https://api.sandbox.midtrans.com";
const auth=env=>"Basic "+btoa(env.MIDTRANS_SERVER_KEY+":");
const cookieName="rellz_admin";
const enc=s=>new TextEncoder().encode(s);
function b64url(bytes){let bin="";for(const b of new Uint8Array(bytes))bin+=String.fromCharCode(b);return btoa(bin).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function fromB64url(s){s=s.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function hmac(secret,data){const key=await crypto.subtle.importKey("raw",enc(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,enc(data)))}
async function makeSession(env){const exp=Date.now()+8*60*60*1000;const payload=b64url(enc(JSON.stringify({exp})));return payload+"."+b64url(await hmac(env.ADMIN_PASSWORD,payload))}
async function validSession(req,env){if(!env.ADMIN_PASSWORD)return false;const raw=(req.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="));if(!raw)return false;const token=raw.slice(cookieName.length+1),parts=token.split(".");if(parts.length!==2)return false;try{const sig=await hmac(env.ADMIN_PASSWORD,parts[0]);const supplied=fromB64url(parts[1]);if(sig.length!==supplied.length)return false;let diff=0;for(let i=0;i<sig.length;i++)diff|=sig[i]^supplied[i];if(diff!==0)return false;const p=JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));return p.exp>Date.now()}catch{return false}}
const cookie=(value,maxAge)=>`${cookieName}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
async function sha512(s){const d=await crypto.subtle.digest("SHA-512",enc(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function refreshPayment(orderId,env){const r=await fetch(apiBase(env)+"/v2/"+encodeURIComponent(orderId)+"/status",{headers:{accept:"application/json",authorization:auth(env)}});if(!r.ok)throw new Error("Midtrans status check failed");const d=await r.json();let status="pending";if(d.transaction_status==="settlement"||(d.transaction_status==="capture"&&d.fraud_status==="accept"))status="paid";else if(["deny","cancel"].includes(d.transaction_status))status="failed";else if(d.transaction_status==="expire")status="expired";await env.DB.prepare("UPDATE orders SET payment_status=?, updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(status,orderId).run();return status}
async function requireAdmin(req,env){return await validSession(req,env)}
export default {async fetch(request,env){
 const u=new URL(request.url),p=u.pathname;
 if(p==="/api/create"&&request.method==="POST"){
  if(!env.MIDTRANS_SERVER_KEY||!env.DB)return json({error:"Server belum dikonfigurasi admin."},500);
  let b;try{b=await request.json()}catch{return json({error:"Data tidak valid."},400)}
  const {name,phone,detail,days}=b||{};
  const amount=PRICES[Number(days)];
  if(typeof name!=="string"||name.trim().length<2||name.length>60)return json({error:"Nama tidak valid."},400);
  if(typeof phone!=="string"||!/^[0-9+ ()-]{8,20}$/.test(phone))return json({error:"Nomor WhatsApp tidak valid."},400);
  if(typeof detail!=="string"||detail.trim().length<5||detail.length>500)return json({error:"Detail permintaan wajib diisi."},400);
  if(!amount)return json({error:"Pilihan durasi tidak valid."},400);
  const orderId="RELLZ-"+Date.now()+"-"+crypto.randomUUID().slice(0,8);
  try{
   const r=await fetch(midBase(env)+"/snap/v1/transactions",{method:"POST",headers:{accept:"application/json","content-type":"application/json",authorization:auth(env)},body:JSON.stringify({transaction_details:{order_id:orderId,gross_amount:amount},item_details:[{id:"joki-kontak",price:amount,quantity:1,name:SERVICE_NAME+" - "+days+" hari"}],customer_details:{first_name:name.trim(),phone:phone.trim()},enabled_payments:["qris"],custom_field1:detail.trim().slice(0,255)})});
   const d=await r.json();if(!r.ok){console.error("Midtrans create error",d);return json({error:"Midtrans gagal membuat tagihan. Periksa aktivasi QRIS."},502)}
   await env.DB.prepare("INSERT INTO orders (order_id,customer_name,customer_phone,service_name,detail,amount,payment_status,fulfillment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(orderId,name.trim(),phone.trim(),SERVICE_NAME,detail.trim()+" ("+days+" hari)",amount,"pending","waiting").run();
   return json({token:d.token,order_id:orderId});
  }catch(e){console.error(e);return json({error:"Gagal membuat pesanan. Coba lagi."},500)}
 }
 if(p==="/api/status"&&request.method==="GET"){
  const id=u.searchParams.get("order_id")||"";if(!/^RELLZ-[A-Za-z0-9-]{10,80}$/.test(id))return json({error:"ID pesanan tidak valid."},400);
  try{return json({status:await refreshPayment(id,env)})}catch{return json({error:"Belum bisa memeriksa status."},502)}
 }
 if(p==="/api/notification"&&request.method==="POST"){
  if(!env.MIDTRANS_SERVER_KEY)return json({error:"Server belum dikonfigurasi."},500);
  try{const n=await request.json();const sig=await sha512(String(n.order_id||"")+String(n.status_code||"")+String(n.gross_amount||"")+env.MIDTRANS_SERVER_KEY);if(typeof n.signature_key!=="string"||sig!==n.signature_key.toLowerCase())return json({error:"Signature tidak valid."},403);await refreshPayment(n.order_id,env);return json({received:true})}catch(e){console.error(e);return json({error:"Notifikasi gagal diverifikasi."},400)}
 }
 if(p==="/api/admin/login"&&request.method==="POST"){
  if(!env.ADMIN_PASSWORD)return json({error:"ADMIN_PASSWORD belum disetel."},500);
  let b;try{b=await request.json()}catch{return json({error:"Data tidak valid."},400)}
  if(typeof b.password!=="string"||b.password!==env.ADMIN_PASSWORD)return json({error:"Password salah."},401);
  return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","set-cookie":cookie(await makeSession(env),28800),"cache-control":"no-store"}});
 }
 if(p.startsWith("/api/admin/")){
  if(!await requireAdmin(request,env))return json({error:"Silakan login admin."},401);
  if(p==="/api/admin/me"&&request.method==="GET")return json({ok:true});
  if(p==="/api/admin/logout"&&request.method==="POST")return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","set-cookie":cookie("",0)}});
  if(p==="/api/admin/orders"&&request.method==="GET"){
   const result=await env.DB.prepare("SELECT order_id,customer_name,customer_phone,service_name,detail,amount,payment_status,fulfillment_status,created_at FROM orders ORDER BY created_at DESC LIMIT 200").all();
   return json({orders:result.results||[]});
  }
  if(p==="/api/admin/fulfillment"&&request.method==="POST"){
   let b;try{b=await request.json()}catch{return json({error:"Data tidak valid."},400)}
   if(typeof b.order_id!=="string"||!["processing","completed"].includes(b.status))return json({error:"Data perubahan tidak valid."},400);
   const row=await env.DB.prepare("SELECT payment_status FROM orders WHERE order_id=?").bind(b.order_id).first();
   if(!row)return json({error:"Pesanan tidak ditemukan."},404);
   if(row.payment_status!=="paid")return json({error:"Pesanan belum dibayar terverifikasi."},409);
   await env.DB.prepare("UPDATE orders SET fulfillment_status=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(b.status,b.order_id).run();
   return json({ok:true});
  }
 }
 return env.ASSETS.fetch(request);
}};
