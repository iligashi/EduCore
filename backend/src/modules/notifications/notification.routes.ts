import { Router } from "express";
import { z } from "zod";
import { Notification } from "../../database/mongo.models.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { roles } from "../../utils/roles.js";

export const notificationRoutes = Router();

const createNotificationSchema = z.object({
  body: z.object({
    userId: z.string().uuid().optional(),
    role: z.enum(roles).optional(),
    title: z.string().min(2).max(160),
    message: z.string().min(2).max(1000),
    type: z.string().max(40).default("system")
  })
});

notificationRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const query =
      req.user?.role === "admin"
        ? {}
        : {
            $or: [{ userId: req.user?.id }, { role: req.user?.role }, { role: { $exists: false }, userId: { $exists: false } }]
          };
    const data = await Notification.find(query).sort({ createdAt: -1 }).limit(100);
    res.json({ data });
  })
);

notificationRoutes.post(
  "/",
  authorize("admin", "instructor"),
  validate(createNotificationSchema),
  asyncHandler(async (req, res) => {
    const payload = { ...req.body };

    if (req.user?.role === "instructor") {
      if (payload.role && payload.role !== "student") {
        throw new HttpError(403, "Instructors can only send notifications to students");
      }
      payload.role = payload.userId ? undefined : "student";
    }

    const notification = await Notification.create(payload);
    if (payload.userId) {
      getIo()?.to(`user:${payload.userId}`).emit("notification:new", notification);
    } else if (payload.role) {
      getIo()?.to(`role:${payload.role}`).emit("notification:new", notification);
    } else {
      getIo()?.emit("notification:new", notification);
    }
    res.status(201).json(notification);
  })
);

notificationRoutes.patch(
  "/:id/read",
  validate(z.object({ params: z.object({ id: z.string() }) })),
  asyncHandler(async (req, res) => {
    const notification = await Notification.findByIdAndUpdate(req.params.id, { readAt: new Date() }, { new: true });
    res.json(notification);
  })
);
