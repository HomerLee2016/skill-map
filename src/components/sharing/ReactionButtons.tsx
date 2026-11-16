import { NO_REACTION, NO_STATS, toggleStar, toggleVote, type Reaction, type SharedStats } from '../../services/sharedReactions';

interface ReactionButtonsProps {
  stats: SharedStats | undefined;
  reaction: Reaction | undefined;
  /** You cannot vote on or star your own share (the database refuses it too). */
  disabled: boolean;
  onReact: (next: Reaction) => void;
}

/** Upvote, downvote and star with their totals. */
export function ReactionButtons({ stats, reaction, disabled, onReact }: ReactionButtonsProps) {
  const total = stats ?? NO_STATS;
  const mine = reaction ?? NO_REACTION;
  return (
    <div className="sharing-reactions">
      <button type="button" className={mine.vote === 1 ? 'sharing-react sharing-react--on' : 'sharing-react'} disabled={disabled} aria-pressed={mine.vote === 1} aria-label={`Upvote (${total.upvotes})`} onClick={() => onReact(toggleVote(mine, 1))}>▲ {total.upvotes}</button>
      <button type="button" className={mine.vote === -1 ? 'sharing-react sharing-react--on sharing-react--down' : 'sharing-react'} disabled={disabled} aria-pressed={mine.vote === -1} aria-label={`Downvote (${total.downvotes})`} onClick={() => onReact(toggleVote(mine, -1))}>▼ {total.downvotes}</button>
      <button type="button" className={mine.starred ? 'sharing-react sharing-react--on sharing-react--star' : 'sharing-react'} disabled={disabled} aria-pressed={mine.starred} aria-label={`${mine.starred ? 'Unstar' : 'Star'} (${total.stars})`} onClick={() => onReact(toggleStar(mine))}>{mine.starred ? '★' : '☆'} {total.stars}</button>
    </div>
  );
}
