// Cifrado de piezas en el navegador: PBKDF2 (SHA-256) + AES-GCM 256.
// Formato del archivo .enc: "VZ1" | sal(16) | iv(12) | datos cifrados.
// Los datos cifrados contienen: largo del encabezado (4 bytes) | encabezado JSON {n,u} | archivo .glb
(function(){
  var ITER=250000,MAGIC=[86,90,49];
  function key(pass,salt,usage){
    return crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']).then(function(k){
      return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt,iterations:ITER,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,usage);
    });
  }
  function encrypt(glbBuf,meta,pass){
    var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    var head=new TextEncoder().encode(JSON.stringify(meta||{}));
    var plain=new Uint8Array(4+head.length+glbBuf.byteLength);
    new DataView(plain.buffer).setUint32(0,head.length);
    plain.set(head,4);plain.set(new Uint8Array(glbBuf),4+head.length);
    return key(pass,salt,['encrypt']).then(function(k){
      return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,plain);
    }).then(function(ct){
      var out=new Uint8Array(3+16+12+ct.byteLength);
      out.set(MAGIC,0);out.set(salt,3);out.set(iv,19);out.set(new Uint8Array(ct),31);
      return out;
    });
  }
  function decrypt(buf,pass){
    var b=new Uint8Array(buf);
    if(b.length<48||b[0]!==MAGIC[0]||b[1]!==MAGIC[1]||b[2]!==MAGIC[2])return Promise.reject(new Error('formato'));
    var salt=b.slice(3,19),iv=b.slice(19,31),ct=b.slice(31);
    return key(pass,salt,['decrypt']).then(function(k){
      return crypto.subtle.decrypt({name:'AES-GCM',iv:iv},k,ct);
    }).then(function(pt){
      var dv=new DataView(pt),hl=dv.getUint32(0);
      var meta=JSON.parse(new TextDecoder().decode(new Uint8Array(pt,4,hl)));
      return {meta:meta,glb:pt.slice(4+hl)};
    });
  }
  window.Cripto={encrypt:encrypt,decrypt:decrypt};
})();
