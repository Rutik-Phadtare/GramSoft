import { AnimatePresence, motion } from "framer-motion";
import ActivityLogCard from "./ActivityLogCard";

// The dashboard's signature element: a live stream of field activity as it
// happens, not a stat that updates on refresh. New entries slide in at the
// top with a brief highlight so the owner can watch the org work in real
// time. Each entry is its own card - click any of them for the full
// submission (every field, exact submission timestamp), not just what
// fits in the summary line.
export default function LiveActivityFeed({ entries }) {
  if (!entries?.length) return null;

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <motion.div
            key={entry._id}
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <ActivityLogCard entry={entry} showEmployee />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
