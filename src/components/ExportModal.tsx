import React, { useState } from 'react';
import { LiveEndpoint, getServedModelName } from '../services/types';
import { copyToClipboard, copyEndpointBundle } from '../services/clipboard';
import { Copy, Check, X, Terminal, Globe, Key, Share2, Sparkles, Code2 } from 'lucide-react';

interface ExportModalProps {
  endpoint: LiveEndpoint;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ endpoint, onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const servedModel = getServedModelName(endpoint.model);

  const handleCopy = async (text: string, key: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleBundleCopy = async (format: 'pair' | 'env' | 'curl', key: string) => {
    const success = await copyEndpointBundle(endpoint, format);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const curlExample = `curl ${endpoint.baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${endpoint.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${servedModel}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;

  const claudeExample = `ANTHROPIC_BASE_URL="${endpoint.baseUrl}" ANTHROPIC_AUTH_TOKEN="${endpoint.apiKey}" ANTHROPIC_MODEL="${servedModel}" claude`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0f172a',
          border: '1px solid var(--border-glow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700 }}>
            <Share2 size={18} color="var(--accent-cyan)" />
            <span>Export API Endpoint Config</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* One-click fast copy dual configuration */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(59, 130, 246, 0.15))',
            border: '1px solid var(--accent-cyan)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} />
            <span>One-Click Dual Config (BaseURL + API Key)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              className="btn btn-primary btn-sm"
              style={{ padding: '8px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => handleBundleCopy('pair', 'bundle-pair')}
            >
              {copiedKey === 'bundle-pair' ? <Check size={14} color="#fff" /> : <Copy size={14} />}
              <span>{copiedKey === 'bundle-pair' ? 'Copied All' : 'Copy URL+Key'}</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              style={{ padding: '8px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => handleBundleCopy('env', 'bundle-env')}
            >
              {copiedKey === 'bundle-env' ? <Check size={14} color="var(--accent-emerald)" /> : <Code2 size={14} />}
              <span>{copiedKey === 'bundle-env' ? 'Copied Env' : 'Copy .env Format'}</span>
            </button>
          </div>
        </div>

        {/* Base URL */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Globe size={13} color="var(--accent-blue)" />
            <span>OpenAI Base URL</span>
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="form-input" readOnly value={endpoint.baseUrl} style={{ fontFamily: 'var(--font-mono)' }} />
            <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(endpoint.baseUrl, 'url')}>
              {copiedKey === 'url' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
              <span style={{ fontSize: '11px', marginLeft: '4px' }}>{copiedKey === 'url' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* API Key */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={13} color="var(--accent-amber)" />
            <span>API Key (Auth Token)</span>
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="form-input" readOnly value={endpoint.apiKey} style={{ fontFamily: 'var(--font-mono)' }} />
            <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(endpoint.apiKey, 'key')}>
              {copiedKey === 'key' ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
              <span style={{ fontSize: '11px', marginLeft: '4px' }}>{copiedKey === 'key' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Claude Code */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Terminal size={13} color="var(--accent-indigo)" />
            <span>Claude Code / Codex Terminal Environment</span>
          </label>
          <div style={{ position: 'relative' }}>
            <pre style={{ fontSize: '11px', margin: 0, paddingRight: '40px' }}>{claudeExample}</pre>
            <button
              className="btn btn-secondary btn-sm"
              style={{ position: 'absolute', top: '6px', right: '6px', padding: '4px 8px' }}
              onClick={() => handleCopy(claudeExample, 'claude')}
            >
              {copiedKey === 'claude' ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* cURL Example */}
        <div className="form-group">
          <label className="form-label">cURL Example</label>
          <div style={{ position: 'relative' }}>
            <pre style={{ fontSize: '11px', margin: 0, paddingRight: '40px' }}>{curlExample}</pre>
            <button
              className="btn btn-secondary btn-sm"
              style={{ position: 'absolute', top: '6px', right: '6px', padding: '4px 8px' }}
              onClick={() => handleCopy(curlExample, 'curl')}
            >
              {copiedKey === 'curl' ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
