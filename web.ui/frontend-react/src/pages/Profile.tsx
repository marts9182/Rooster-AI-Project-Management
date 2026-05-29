/**
 * Profile editor — `/profile`.
 *
 * Loads the singleton `profile` row on mount, presents a small form, and PUTs
 * the patch back. `pen_names` is a chip input (Enter / Add button to insert,
 * × to remove). `brand_palette` is up to 5 hex swatches via <input type="color">.
 * Each text field has a HelpIcon for the matching help article.
 *
 * On a successful save we flash a green "Saved" badge for a few seconds.
 */
import { useEffect, useState } from 'react';
import {
  getProfile,
  updateProfile,
  type Profile as ProfileT,
} from '../api/profile';
import HelpIcon from '../components/HelpIcon';

const PALETTE_SLOTS = 5;
const DEFAULT_SWATCH = '#cccccc';

export default function Profile() {
  const [p, setP] = useState<ProfileT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [penInput, setPenInput] = useState('');

  useEffect(() => {
    getProfile()
      .then((prof) => {
        setP(prof);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof ProfileT>(key: K, value: ProfileT[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  function addPenName() {
    const v = penInput.trim();
    if (!v || !p) return;
    if (p.pen_names.includes(v)) {
      setPenInput('');
      return;
    }
    update('pen_names', [...p.pen_names, v]);
    setPenInput('');
  }

  function removePenName(i: number) {
    if (!p) return;
    update('pen_names', p.pen_names.filter((_, idx) => idx !== i));
  }

  function handlePenKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPenName();
    }
  }

  function updateSwatch(idx: number, hex: string) {
    if (!p) return;
    const palette = [...p.brand_palette];
    while (palette.length < PALETTE_SLOTS) palette.push(DEFAULT_SWATCH);
    palette[idx] = hex;
    update('brand_palette', palette.slice(0, PALETTE_SLOTS));
  }

  async function handleSave() {
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile({
        display_name: p.display_name,
        pen_names: p.pen_names,
        kdp_author_url: p.kdp_author_url,
        etsy_shop_url: p.etsy_shop_url,
        pinterest_url: p.pinterest_url,
        gmail_address: p.gmail_address,
        brand_palette: p.brand_palette,
        time_zone: p.time_zone,
      });
      setP(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !p) {
    return (
      <section>
        <p>Loading…</p>
      </section>
    );
  }

  if (error && !p) {
    return (
      <section>
        <p role="alert" className="error-text">
          {error}
        </p>
      </section>
    );
  }

  if (!p) {
    return (
      <section>
        <p>No profile.</p>
      </section>
    );
  }

  // Pad brand_palette out to PALETTE_SLOTS for rendering swatches.
  const swatches: string[] = [];
  for (let i = 0; i < PALETTE_SLOTS; i++) {
    swatches.push(p.brand_palette[i] ?? DEFAULT_SWATCH);
  }

  const rowStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '12px',
  };
  const labelTextStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontWeight: 500,
  };
  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    maxWidth: '420px',
  };

  return (
    <section style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1>Profile</h1>
      </div>

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      <label style={rowStyle} htmlFor="profile-display-name">
        <span style={labelTextStyle}>Display name</span>
        <input
          id="profile-display-name"
          type="text"
          value={p.display_name ?? ''}
          onChange={(e) => update('display_name', e.target.value)}
          style={inputStyle}
        />
      </label>

      <fieldset className="mb-3" style={{ border: '1px solid #ddd', padding: '8px 12px' }}>
        <legend>Pen names</legend>
        <ul
          className="row gap-2 mb-2"
          style={{
            listStyle: 'none',
            padding: 0,
            marginTop: 0,
            flexWrap: 'wrap',
          }}
        >
          {p.pen_names.map((n, i) => (
            <li
              key={`${n}-${i}`}
              className="row gap-2"
              style={{
                background: '#eef2f7',
                borderRadius: '14px',
                padding: '2px 10px',
                display: 'inline-flex',
              }}
            >
              <span>{n}</span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => removePenName(i)}
                aria-label={`Remove ${n}`}
                style={{ lineHeight: 1 }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="row gap-2">
          <input
            type="text"
            placeholder="Add pen name and press Enter"
            value={penInput}
            onChange={(e) => setPenInput(e.target.value)}
            onKeyDown={handlePenKeyDown}
            aria-label="Add pen name"
          />
          <button type="button" className="btn btn--secondary" onClick={addPenName}>
            Add
          </button>
        </div>
      </fieldset>

      <label style={rowStyle} htmlFor="profile-kdp-author-url">
        <span style={labelTextStyle}>
          KDP author URL <HelpIcon field="kdp_author_url" />
        </span>
        <input
          id="profile-kdp-author-url"
          type="url"
          value={p.kdp_author_url ?? ''}
          onChange={(e) => update('kdp_author_url', e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={rowStyle} htmlFor="profile-etsy-shop-url">
        <span style={labelTextStyle}>
          Etsy shop URL <HelpIcon field="etsy_shop_url" />
        </span>
        <input
          id="profile-etsy-shop-url"
          type="url"
          value={p.etsy_shop_url ?? ''}
          onChange={(e) => update('etsy_shop_url', e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={rowStyle} htmlFor="profile-pinterest-url">
        <span style={labelTextStyle}>
          Pinterest URL <HelpIcon field="pinterest_url" />
        </span>
        <input
          id="profile-pinterest-url"
          type="url"
          value={p.pinterest_url ?? ''}
          onChange={(e) => update('pinterest_url', e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={rowStyle} htmlFor="profile-gmail">
        <span style={labelTextStyle}>
          Gmail address <HelpIcon field="gmail_app_password" />
        </span>
        <input
          id="profile-gmail"
          type="email"
          value={p.gmail_address ?? ''}
          onChange={(e) => update('gmail_address', e.target.value)}
          style={inputStyle}
        />
      </label>

      <fieldset className="mb-3" style={{ border: '1px solid #ddd', padding: '8px 12px' }}>
        <legend>Brand palette</legend>
        <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
          {swatches.map((hex, i) => (
            <label
              key={i}
              className="stack text-xs"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <input
                type="color"
                value={hex}
                onChange={(e) => updateSwatch(i, e.target.value)}
                aria-label={`Brand color ${i + 1}`}
                style={{
                  width: 44,
                  height: 44,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
              <code className="mt-1">{hex}</code>
            </label>
          ))}
        </div>
      </fieldset>

      <label style={rowStyle} htmlFor="profile-time-zone">
        <span style={labelTextStyle}>Time zone</span>
        <input
          id="profile-time-zone"
          type="text"
          value={p.time_zone ?? ''}
          onChange={(e) => update('time_zone', e.target.value)}
          style={inputStyle}
        />
      </label>

      <div className="mt-4">
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span
            role="status"
            style={{ marginLeft: '12px', color: 'green', fontWeight: 500 }}
          >
            Saved ✓
          </span>
        )}
      </div>
    </section>
  );
}
