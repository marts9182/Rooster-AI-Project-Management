import { NavLink } from 'react-router-dom';
import './../styles/shell.css';

const LINKS: Array<{ to: string; label: string; icon: string }> = [
  { to: '/',          label: 'Home',      icon: '🏠' },
  { to: '/kdp',       label: 'KDP',       icon: '📚' },
  { to: '/etsy',      label: 'Etsy',      icon: '🛍️' },
  { to: '/plans',     label: 'Plans',     icon: '🗺️' },
  { to: '/calendar',  label: 'Calendar',  icon: '📅' },
  { to: '/pinterest', label: 'Pinterest', icon: '📌' },
  { to: '/profile',   label: 'Profile',   icon: '👤' },
  { to: '/help',      label: 'Help',      icon: '❓' },
];

export default function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-logo">🐓 Rooster</div>
      <ul>
        {LINKS.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="sidebar-icon" aria-hidden="true">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
