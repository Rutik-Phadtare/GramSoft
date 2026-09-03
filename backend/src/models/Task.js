const { Schema, model, models } = require("mongoose");

// An admin assigning a specific to-do to a specific employee - e.g. "attend
// the software demo at X Grampanchayat by Friday" - separate from the
// day-to-day activity log (which is the employee recording what they did,
// not the admin telling them what to do). Shows up on that employee's
// dashboard; the employee reports back by changing status and, once done,
// leaving a short report the admin can read.
const STATUSES = ["pending", "in_progress", "completed", "cancelled"];
const PRIORITIES = ["low", "normal", "high"];

const TaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    gramPanchayatId: { type: Schema.Types.ObjectId, ref: "GramPanchayat" }, // optional - "for this Grampanchayat"
    priority: { type: String, enum: PRIORITIES, default: "normal" },
    dueDate: { type: Date },
    status: { type: String, enum: STATUSES, default: "pending" },
    report: { type: String, trim: true }, // what the employee reports back, once done (or to note progress)
    reportedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

TaskSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
TaskSchema.index({ assignedBy: 1, createdAt: -1 });

const TaskModel = models.Task || model("Task", TaskSchema);
TaskModel.STATUSES = STATUSES;
TaskModel.PRIORITIES = PRIORITIES;

module.exports = TaskModel;
