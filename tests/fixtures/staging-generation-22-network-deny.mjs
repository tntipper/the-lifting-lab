/** Deny all outgoing network access in disposable Generation 22 rehearsal children. */
import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'

const deny = () => { throw Error('Generation 22 rehearsal forbids network access') }
globalThis.fetch = deny
net.Socket.prototype.connect = deny
net.connect = deny
net.createConnection = deny
tls.connect = deny
http.request = deny
http.get = deny
https.request = deny
https.get = deny
syncBuiltinESMExports()
