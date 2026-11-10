// The registry entry, the npm package it points at and package.json must name one version, or the registry would point at a
// package version that does not exist. CI runs this on every PR, and the publish workflow runs it before it publishes.
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const server = JSON.parse(readFileSync('server.json', 'utf8'))
const wrong = []
if (server.version !== pkg.version) wrong.push(`server.json says ${server.version}`)
for (const p of (server.packages ?? []).filter((x) => x.identifier === pkg.name)) {
  if (p.version !== pkg.version) wrong.push(`server.json's npm package says ${p.version}`)
}
if (pkg.mcpName !== server.name) wrong.push(`package.json's mcpName is ${pkg.mcpName} and server.json's name is ${server.name}`)
if (wrong.length) {
  console.error(`package.json says ${pkg.version}, but ${wrong.join(', and ')}.`)
  process.exit(1)
}
console.log(`${pkg.name} ${pkg.version} and ${server.name} agree.`)
