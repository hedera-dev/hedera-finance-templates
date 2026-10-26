import type { ActivityEntryView } from "~~/types/ats";
import { hashscanTxUrl } from "~~/utils/ats/hashscan";

export const ActivityLog = ({ entries }: { entries: ActivityEntryView[] }) => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-3">
        <div>
          <h2 className="card-title text-lg">Activity</h2>
          <p className="text-sm text-base-content/60 m-0">Every action the desk performed, newest first.</p>
        </div>

        <ul id="activity" className="flex flex-col gap-2 text-sm">
          {entries.length === 0 ? (
            <li className="text-base-content/50">Nothing yet.</li>
          ) : (
            entries.map(entry => (
              <li
                key={entry.id}
                className="activity-entry flex flex-wrap items-baseline gap-2 border-b border-base-200 pb-2 last:border-none"
              >
                <span className="text-xs text-base-content/50">{new Date(entry.time).toLocaleTimeString()}</span>
                <span className="flex-1">{entry.action}</span>
                <span
                  className={entry.result === "SUCCESS" ? "badge badge-success badge-sm" : "badge badge-error badge-sm"}
                >
                  {entry.result}
                </span>
                {entry.txHash ? (
                  <a
                    href={hashscanTxUrl(entry.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link text-xs"
                  >
                    tx
                  </a>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};
