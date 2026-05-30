import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { api } from '../../api/client'
import GqrisImportTrigger from './GqrisImportTrigger'

function normalizeDevices(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.devices)) return payload.devices
  if (Array.isArray(payload?.content)) return payload.content
  return []
}

function statusClass(status) {
  if (status === 'verifying') return 'verifying'
  if (status === 'needs_review') return 'needs-review'
  if (status === 'verified' || status === 'APPROVED') return 'verified'
  return 'pending'
}

// ─── Approve Modal ────────────────────────────────────────────────────────────
function ApproveModal({ registration, onConfirm, onCancel }) {
  const [inputValue, setInputValue] = useState('')
  const [names, setNames] = useState([])
  const [error, setError] = useState('')

  const addName = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    if (names.includes(trimmed)) {
      setError('Name already added.')
      return
    }
    setNames((prev) => [...prev, trimmed])
    setInputValue('')
    setError('')
  }

  const removeName = (name) => setNames((prev) => prev.filter((n) => n !== name))

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addName()
    }
  }

  const handleConfirm = () => {
    if (names.length === 0) {
      setError('Please add at least one researcher name.')
      return
    }
    onConfirm(names)
  }

  return (
      <div className="modal-backdrop">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Approve Device">
          <div className="modal-header">
            <h3>Approve Device</h3>
            <button className="btn" onClick={onCancel} aria-label="Close modal">✕</button>
          </div>

          <div className="modal-body">
            <p style={{ marginBottom: '0.75rem' }}>
              Approving <strong>{registration.ssaid ?? registration.id}</strong>. Enter the researcher
              names that will be linked to this device.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => { setInputValue(e.target.value); setError('') }}
                  onKeyDown={handleKeyDown}
                  placeholder="Researcher name…"
                  aria-label="Researcher name"
                  style={{
                    flex: 1,
                    padding: '0.45rem 0.75rem',
                    border: '1px solid #ccd',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                  }}
              />
              <button className="primary-button" type="button" onClick={addName}>
                Add
              </button>
            </div>

            {error && (
                <p style={{ color: '#cc1f1f', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>{error}</p>
            )}

            {names.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {names.map((name) => (
                      <li
                          key={name}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            background: '#eef2ff',
                            border: '1px solid #c7d2fe',
                            borderRadius: '999px',
                            padding: '0.2rem 0.65rem',
                            fontSize: '0.85rem',
                            color: '#3730a3',
                          }}
                      >
                        {name}
                        <button
                            type="button"
                            onClick={() => removeName(name)}
                            aria-label={`Remove ${name}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </li>
                  ))}
                </ul>
            )}
          </div>

          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="button" onClick={handleConfirm}>
              Confirm Approval
            </button>
          </div>
        </div>
      </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function DeviceManagementPage() {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedRegistration, setSelectedRegistration] = useState(null)
  const [pendingApproval, setPendingApproval] = useState(null) // device awaiting name input
  const [copied, setCopied] = useState(false)

  const qrValue = useMemo(() => {
    if (import.meta.env.VITE_QR_URL) return import.meta.env.VITE_QR_URL
    if (typeof window !== 'undefined' && window.location?.origin) {
      const host = window.location.hostname
      const lanHost = import.meta.env.VITE_LAN_HOST
      const resolvedHost =
          host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
              ? lanHost || host
              : host
      const port = window.location.port ? `:${window.location.port}` : ''
      return `${window.location.protocol}//${resolvedHost}${port}/login`
    }
    return import.meta.env.VITE_API_URL ?? 'https://amylens-backend.onrender.com'
  }, [])

  const fetchDevices = () => {
    setLoading(true)
    setError(null)
    api
        .getAllDevices()
        .then((payload) => setRegistrations(normalizeDevices(payload)))
        .catch(() => {
          setError('Failed to load devices.')
          setRegistrations([])
        })
        .finally(() => setLoading(false))
  }

  useEffect(() => { fetchDevices() }, [])

  const stats = useMemo(() => {
    const total = registrations.length
    const activeFleet = registrations.filter(
        (r) => r.status === 'verified' || r.status === 'APPROVED'
    ).length
    const pendingApprovalCount = registrations.filter(
        (r) => r.status === 'PENDING' || r.status === 'pending'
    ).length
    return { total, activeFleet, pendingApproval: pendingApprovalCount }
  }, [registrations])

  const closeModal = () => setSelectedRegistration(null)

  // Called when the ✓ approve button is clicked — opens the name-input modal
  const initiateApprove = (registration) => {
    setPendingApproval(registration)
  }

  // Called when the user confirms the researcher names in the ApproveModal
  const confirmApprove = async (names) => {
    const registration = pendingApproval
    setPendingApproval(null)
    try {
      await api.approveDevice(registration.id, names)
    } catch {
      // optimistic update still applies so the UI responds even on error
    }
    setRegistrations((current) =>
        current.map((item) =>
            item.id === registration.id ? { ...item, status: 'verified' } : item
        )
    )
  }

  const denyDevice = async (registration) => {
    try {
      await api.denyDevice(registration.id)
    } catch {
      // optimistic
    }
    setRegistrations((current) =>
        current.map((item) =>
            item.id === registration.id ? { ...item, status: 'needs_review' } : item
        )
    )
  }

  const copyQrUrl = async () => {
    try {
      await navigator.clipboard.writeText(qrValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
      <div className="module-grid" aria-label="Device Management Workspace">
        <section className="hero-grid">
          <article className="card qr-card hero-qr-card">
            <div className="card-title">Provisioning</div>
            <div className="pill-row">
              <span className="pill pill-info">Active Node</span>
            </div>
            <div className="qr-frame">
              <QRCodeCanvas value={qrValue} size={220} includeMargin />
            </div>
            <div>
              <h3 className="section-title" style={{ textAlign: 'center' }}>Setup QR Code</h3>
              <div className="help-note" style={{ textAlign: 'center' }}>
                Scan to authorize new field units into the local cluster.
              </div>
            </div>
            <div className="qr-url">
              <span>{qrValue}</span>
              <button className="ghost-button" type="button" onClick={copyQrUrl}>
                {copied ? '✓' : '⧉'}
              </button>
            </div>
          </article>

          <section className="hero-stack">
            <div className="hero-stack-top">
              <article className="card">
                <div className="card-title">Active Fleet</div>
                <div className="mini-summary">
                  <strong>{stats.activeFleet}</strong>
                  <span>/ {stats.total}</span>
                </div>
                <div className="mini-progress" aria-hidden="true">
                <span
                    style={{
                      width: `${Math.min(
                          100,
                          Math.round((stats.activeFleet / Math.max(stats.total, 1)) * 100)
                      )}%`,
                    }}
                />
                </div>
                <div className="stat-caption">Capacity utilized across regions</div>
              </article>

              <article className="card">
                <div className="card-title" style={{ color: '#cc1f1f' }}>Pending Approval</div>
                <div className="stat-number">{String(stats.pendingApproval).padStart(2, '0')}</div>
                <div className="stat-caption">Requires immediate review</div>
                <div style={{ textAlign: 'right', marginTop: 'auto' }}>
                  <button className="ghost-button" type="button">View All</button>
                </div>
              </article>
            </div>

            <article className="card blue-panel hero-blue-panel">
              <div className="card-title">System Health</div>
              <h2 style={{ margin: '0.3rem 0', fontSize: '2rem' }}>All protocols operational</h2>
              <div className="stat-caption">Last security handshake: 2 mins ago</div>
            </article>
          </section>
        </section>

        <section className="section-card" style={{ margin: '50px 0px 0px 0px' }}>
          <div className="section-head">
            <div>
              <h2 className="section-title">Device Management Roster</h2>
              <div className="section-subtitle">Authorization queue for new hardware nodes.</div>
            </div>
            <div className="pill-row">
              <GqrisImportTrigger />
              <button className="ghost-button" type="button" onClick={fetchDevices}>Refresh</button>
            </div>
          </div>

          {loading && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#556' }}>Loading devices…</div>
          )}
          {error && <div style={{ padding: '1rem', color: '#cc1f1f' }}>{error}</div>}

          {!loading && !error && registrations.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#556' }}>
                No devices registered yet.
              </div>
          )}

          {!loading && registrations.length > 0 && (
              <div className="table-wrap">
                <table className="module-table">
                  <thead>
                  <tr>
                    <th>SSAID</th>
                    <th>Date Added</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                  </thead>
                  <tbody>
                  {registrations.map((registration) => (
                      <tr key={registration.id}>
                        <td>{registration.ssaid ?? registration.id}</td>
                        <td>
                          {new Date(
                              registration.dateAdded ??
                              registration.lastSeenAt ??
                              registration.createdAt ??
                              Date.now()
                          ).toLocaleString('en-US', {
                            month: 'short',
                            day: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>
                      <span className={`status-tag ${statusClass(registration.status)}`}>
                        <span>●</span>
                        <span>{String(registration.status ?? 'pending').toUpperCase()}</span>
                      </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                                className="ghost-button sr-only"
                                aria-label={`Manage ${registration.ssaid ?? registration.id}`}
                                type="button"
                                onClick={() => setSelectedRegistration(registration)}
                            >
                              Manage
                            </button>
                            <button
                                className="primary-button"
                                type="button"
                                onClick={() => initiateApprove(registration)}
                                aria-label={`Approve ${registration.ssaid ?? registration.id}`}
                            >
                              ✓
                            </button>
                            <button
                                className="outline-button"
                                type="button"
                                onClick={() => denyDevice(registration)}
                                aria-label={`Deny ${registration.ssaid ?? registration.id}`}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                  ))}
                  </tbody>
                </table>
              </div>
          )}

          <div className="meta-footer">
            <div>
              Showing {registrations.length} device{registrations.length !== 1 ? 's' : ''}
            </div>
          </div>
        </section>

        {/* Researcher name input modal — shown when approving a device */}
        {pendingApproval && (
            <ApproveModal
                registration={pendingApproval}
                onConfirm={confirmApprove}
                onCancel={() => setPendingApproval(null)}
            />
        )}

        {/* Device configuration modal */}
        {selectedRegistration && (
            <div className="modal-backdrop">
              <div
                  className="modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Device Configuration Modal"
              >
                <div className="modal-header">
                  <h3>{selectedRegistration.ssaid ?? selectedRegistration.id} Configuration</h3>
                  <button className="btn" onClick={closeModal} aria-label="Close modal">✕</button>
                </div>
                <div className="modal-body">
                  <p>Manage assignment and health routing for this device.</p>
                </div>
                <div className="modal-actions">
                  <button className="ghost-button" type="button" onClick={closeModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
        )}
      </div>
  )
}

export default DeviceManagementPage