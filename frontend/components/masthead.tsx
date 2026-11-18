import { Bookmark } from 'lucide-react'

/**
 * Site header: the Offscript wordmark with the domain as a printed stamp,
 * and one action, "My evening".
 */
export function Masthead({ count, showPicks }: { count: number; showPicks: () => void }) {
  return (
    <header>
      <div className="navwrap">
        <a className="x-brand" href="#top" aria-label="Offscript, kulturprogramm.eu — to the top">
          <span className="brand"><span className="burst" aria-hidden="true" />OFFSCRIPT<span className="tm">®</span></span>
          <span className="x-domain">kulturprogramm.eu</span>
        </a>
        <button className="saves" onClick={showPicks}><Bookmark size={15} /> My evening <b>{count}</b></button>
      </div>
    </header>
  )
}
