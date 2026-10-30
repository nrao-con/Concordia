import { storage } from "./storage";
import type { InsertAuditLog } from "@shared/schema";
import { AUDIT_ENTITY_TYPES } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";

type AuditEntityType = typeof AUDIT_ENTITY_TYPES[number];

export async function logAudit(params: {
  req: Request;
  actionType: "create" | "update" | "delete" | "view" | "export";
  entityType: AuditEntityType;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
}) {
  try {
    const userId = (params.req as any).user?.claims?.sub || null;
    const ipAddress = params.req.ip || params.req.socket.remoteAddress || null;
    const userAgent = params.req.get("user-agent") || null;

    const auditLog: InsertAuditLog = {
      userId,
      actionType: params.actionType,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: params.oldValue ? JSON.parse(JSON.stringify(params.oldValue)) : null,
      newValue: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : null,
      ipAddress,
      userAgent,
    };

    await storage.createAuditLog(auditLog);
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

// Middleware to auto-log mutations based on route patterns
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method;
  const path = req.path;

  // Patient-chat routes create their own required, metadata-only audit entries.
  // Never intercept their request/response flow: chat responses contain message
  // content and must not be copied into a generic audit record.
  if (path === "/api/chat" || path.startsWith("/api/chat/")) {
    return next();
  }

  // Only log mutating operations
  if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
    return next();
  }

  // Store original json/send methods to intercept responses
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  let captured = false;
  const captureResponse = (body: any) => {
    if (captured || res.statusCode >= 400) return body; // Only log successful operations once
    captured = true;

    // Determine entity type and action from path
    let entityType: any = "user";
    let actionType: any = "update";
    let entityId: string | undefined;

    if (path.includes("/prescriptions")) {
      entityType = "prescription";
      actionType = method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
      entityId = req.params.id;
    } else if (path.includes("/orders") || path.includes("/checkout")) {
      entityType = "order";
      actionType = method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
      entityId = req.params.id || body?.id;
    } else if (path.includes("/cart")) {
      entityType = "cart";
      actionType = method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
      entityId = req.params.id || body?.id;
    } else if (path.includes("/products")) {
      entityType = "product";
      actionType = method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
      entityId = req.params.id;
    }

    // Log asynchronously without blocking response
    setImmediate(() => {
      logAudit({
        req,
        actionType,
        entityType,
        entityId,
        newValue: body,
      });
    });

    return body;
  };

  res.json = function(body: any) {
    return originalJson(captureResponse(body));
  };

  res.send = function(body: any) {
    return originalSend(captureResponse(body));
  };

  next();
}
