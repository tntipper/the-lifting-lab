/** Local synthetic ledger. Reuses the reviewed fixture reducer; never authenticates hosted evidence. */
import * as fs from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { createSuccessorFixtureJournal } from './staging-owner-successor-fixture.mjs'
const unavailable = () => { throw Error('Successor durable journal unavailable') }
const exact = (v, names) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...names].sort().join('|')
const ownerDirectory = (path, io) => {
  const stat = io.lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()
    || (stat.mode & 0o777) !== 0o700 || io.realpathSync(path) !== resolve(path)) unavailable()
}
function read(path, io) {
  const stat = io.lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.nlink !== 1
    || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > 4096) unavailable()
  const raw = io.readFileSync(path, 'utf8'), value = JSON.parse(raw)
  if (raw !== `${JSON.stringify(value)}\n`) unavailable()
  return value
}
function persist(path, value, io) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  if (bytes.length > 4096) unavailable()
  let fd
  try {
    fd = io.openSync(path, 'wx', 0o600)
    for (let offset = 0; offset < bytes.length;) {
      const written = io.writeSync(fd, bytes, offset, bytes.length - offset)
      if (!Number.isSafeInteger(written) || written < 1 || written > bytes.length - offset) unavailable()
      offset += written
    }
    io.fsyncSync(fd); io.closeSync(fd); fd = undefined
    const directory = io.openSync(resolve(path, '..'), 'r')
    try { io.fsyncSync(directory) } finally { io.closeSync(directory) }
  } finally { if (fd !== undefined) io.closeSync(fd); bytes.fill(0) }
}
const alive = pid => {
  for (const target of [pid, -pid]) {
    try { process.kill(target, 0); return true } catch (error) { if (error?.code !== 'ESRCH') return true }
  }
  return false
}
function replay(path, io) {
  ownerDirectory(path, io)
  const header = read(join(path, 'identity.json'), io)
  if (!exact(header, ['schema', 'plan', 'ownerPid', 'authorization', 'provenance']) || header.schema !== 'tll-successor-local-ledger/v1'
    || header.authorization !== 'NONE' || header.provenance !== 'SYNTHETIC_LOCAL_ONLY'
    || !Number.isSafeInteger(header.ownerPid) || header.ownerPid < 2) unavailable()
  const model = createSuccessorFixtureJournal(header.plan)
  let current = model.begin()
  const names = io.readdirSync(path).sort()
  if (names.some(name => !/^(?:identity\.json|recovery\.claim|\d{3}\.json)$/.test(name))) unavailable()
  const events = names.filter(name => /^\d{3}\.json$/.test(name))
  if (events.length > 80) unavailable()
  for (let index = 0; index < events.length; index++) {
    if (events[index] !== `${String(index).padStart(3, '0')}.json`) unavailable()
    const event = read(join(path, events[index]), io)
    if (!exact(event, ['operation', 'argument', 'now'])
      || !['dispatch', 'observe', 'hold', 'recover'].includes(event.operation)) unavailable()
    if (['hold', 'recover'].includes(event.operation)) {
      if (event.argument !== null) unavailable()
      current = model[event.operation](current, event.now)
    } else current = model[event.operation](current, event.argument, event.now)
  }
  if (names.includes('recovery.claim')) {
    const claim = read(join(path, 'recovery.claim'), io)
    if (!exact(claim, ['ownerPid']) || !Number.isSafeInteger(claim.ownerPid) || claim.ownerPid < 2) unavailable()
  }
  return { header, model, current, sequence: events.length }
}
export function createSuccessorDurableJournal({ root, plan, io = fs, recovering = false, isOwnerAlive = alive } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root) || typeof isOwnerAlive !== 'function') unavailable()
  ownerDirectory(root, io)
  // Validate before claiming the directory; only non-secret plan fields can reach disk.
  createSuccessorFixtureJournal(plan)
  const path = join(root, plan.windowId)
  let faulted = false, state
  if (!recovering) {
    io.mkdirSync(path, { mode: 0o700 }) // exclusive permanent one-use claim; never deleted by this module
    persist(join(path, 'identity.json'), { schema: 'tll-successor-local-ledger/v1', plan, ownerPid: process.pid,
      authorization: 'NONE', provenance: 'SYNTHETIC_LOCAL_ONLY' }, io)
    state = replay(path, io)
  } else {
    state = replay(path, io)
    if (JSON.stringify(state.header.plan) !== JSON.stringify(plan) || isOwnerAlive(state.header.ownerPid)
      || !['ACTIVE', 'SHUTDOWN_REQUIRED'].includes(state.current.state)) unavailable()
    persist(join(path, 'recovery.claim'), { ownerPid: process.pid }, io) // a second recovery is forbidden
  }
  const append = (operation, argument, now) => {
    if (faulted) unavailable()
    let disk
    try { disk = replay(path, io) } catch { faulted = true; unavailable() }
    if (JSON.stringify(disk.current) !== JSON.stringify(state.current) || disk.sequence !== state.sequence) unavailable()
    const next = ['hold', 'recover'].includes(operation)
        ? disk.model[operation](disk.current, now) : disk.model[operation](disk.current, argument, now)
    try {
      persist(join(path, `${String(state.sequence).padStart(3, '0')}.json`), { operation, argument, now }, io)
      state = { ...disk, current: next, sequence: disk.sequence + 1 }
      return next
    } catch { faulted = true; unavailable() }
  }
  return Object.freeze({ path, read: () => replay(path, io).current,
    dispatch: (phase, now) => append('dispatch', phase, now),
    observe: (proof, now) => append('observe', proof, now),
    hold: now => append('hold', null, now), recover: now => append('recover', null, now) })
}
