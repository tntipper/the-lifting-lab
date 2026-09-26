/** Public Supabase trust anchor used by staging Postgres clients. */
import { createHash, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SUPABASE_CA_DER_SHA256='807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa'
export const SUPABASE_CA_FILE_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
const path=fileURLToPath(new URL('../config/certs/supabase-prod-ca-2021.crt',import.meta.url))

export function readPinnedSupabaseCa({read=readFileSync,now=Date.now()}={}){
  let bytes
  try{
    bytes=read(path)
    if(!Buffer.isBuffer(bytes)||bytes.length!==1367||createHash('sha256').update(bytes).digest('hex')!==SUPABASE_CA_FILE_SHA256)throw Error()
    const pem=bytes.toString('utf8'),certificate=new X509Certificate(pem)
    if(!certificate.ca||certificate.subject!==certificate.issuer||createHash('sha256').update(certificate.raw).digest('hex')!==SUPABASE_CA_DER_SHA256
      ||Date.parse(certificate.validFrom)>now||Date.parse(certificate.validTo)<=now)throw Error()
    return Object.freeze({pem,sha256:SUPABASE_CA_DER_SHA256})
  }catch{throw new Error('Staging Supabase CA unavailable')}
  finally{if(Buffer.isBuffer(bytes))bytes.fill(0)}
}
