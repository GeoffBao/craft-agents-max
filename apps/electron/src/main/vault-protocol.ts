/**
 * Vault Protocol Handler
 *
 * Registers a custom `vault://` protocol that serves static files
 * (images, attachments) from the knowledge base vault directory.
 *
 * URL format: vault://<relative/path/in/vault>
 * Example:    vault://Wiki/concepts/attachments/diagram.png
 *
 * This lets the renderer display vault images without file:// security issues.
 */

import path from 'path'
import { protocol, net } from 'electron'

export function registerVaultScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'vault',
      privileges: {
        supportFetchAPI: true,
        standard: true,
        corsEnabled: true,
        stream: true,
        // Allow loading in img/video elements without CSP issues
        bypassCSP: true,
      },
    },
  ])
}

export function registerVaultHandler(): void {
  protocol.handle('vault', async (request) => {
    try {
      const url = new URL(request.url)
      // vault://host/path → combine host + pathname (Obsidian paths often have sections)
      const relativePath = decodeURIComponent((url.host + url.pathname).replace(/^\//, ''))

      let vaultRoot = ''
      try {
        const { getKnowledgeBaseEngine } = await import('@craft-agent/knowledge-base')
        const engine = getKnowledgeBaseEngine()
        vaultRoot = engine?.getConfig().vaultPath ?? ''
      } catch {
        // engine not yet ready — return 404
      }

      if (!vaultRoot) {
        return new Response('Vault not ready', { status: 503 })
      }

      const filePath = path.join(vaultRoot, relativePath)
      return net.fetch('file://' + filePath)
    } catch (err) {
      return new Response('Not found', { status: 404 })
    }
  })
}
