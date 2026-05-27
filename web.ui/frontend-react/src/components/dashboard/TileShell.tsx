import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface TileShellProps {
  /** Test id attached to the outer wrapper (`tile-${id}`). */
  id: string;
  emoji: string;
  title: string;
  /** Path the "view all →" link navigates to. */
  viewAllHref: string;
  /** Optional class fragment appended to the outer tile (for variants). */
  className?: string;
  children: ReactNode;
}

/**
 * Consistent wrapper for dashboard tiles: a header row with title + view-all
 * link, then a scrollable body. The header row is the drag handle (matches
 * `draggableHandle=".tile-header"` on the react-grid-layout instance).
 */
export default function TileShell({
  id,
  emoji,
  title,
  viewAllHref,
  className,
  children,
}: TileShellProps) {
  return (
    <div
      className={`tile${className ? ` ${className}` : ''}`}
      data-testid={`tile-${id}`}
    >
      <div className="tile-header">
        <h3>
          <span aria-hidden="true">{emoji}</span> {title}
        </h3>
        <Link to={viewAllHref} className="tile-view-all">
          view all →
        </Link>
      </div>
      <div className="tile-body">{children}</div>
    </div>
  );
}
