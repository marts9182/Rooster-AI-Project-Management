import { useState } from 'react';
import HelpDrawer from '../components/HelpDrawer';

interface HelpTopic {
  field: string;
  title: string;
  emoji: string;
}

/**
 * Hardcoded index of help articles. Matches the markdown files shipped at
 * `web.ui/backend/help/*.md`. New articles should be added here AND the
 * matching markdown file dropped in the backend's `help/` directory.
 */
const TOPICS: HelpTopic[] = [
  { field: 'asin', title: 'Finding your ASIN', emoji: '📚' },
  { field: 'kdp_author_url', title: 'Your Amazon Author page URL', emoji: '🌐' },
  { field: 'etsy_shop_url', title: 'Your Etsy shop URL', emoji: '🛒' },
  { field: 'pinterest_url', title: 'Your Pinterest profile URL', emoji: '📌' },
  {
    field: 'gmail_app_password',
    title: 'Generating a Gmail App Password',
    emoji: '🔑',
  },
  { field: 'bisac_code', title: 'Picking a BISAC code', emoji: '🏷️' },
  {
    field: 'release_date',
    title: 'Finding your book release date',
    emoji: '📅',
  },
];

export default function Help() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section>
      <div className="page-header">
        <h1>❓ Help</h1>
      </div>
      <p>
        Quick answers for the things you usually have to copy/paste from
        Amazon, Etsy, Pinterest, or Gmail. Pick a topic to open the article.
      </p>
      <div className="help-index-grid" role="list">
        {TOPICS.map((t) => (
          <button
            key={t.field}
            type="button"
            role="listitem"
            className="help-card"
            onClick={() => setSelected(t.field)}
            aria-label={`Open help: ${t.title}`}
          >
            <span className="help-card-emoji" aria-hidden="true">
              {t.emoji}
            </span>
            <span className="help-card-title">{t.title}</span>
          </button>
        ))}
      </div>
      <HelpDrawer
        field={selected}
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
