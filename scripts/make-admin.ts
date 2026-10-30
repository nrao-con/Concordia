#!/usr/bin/env tsx

/**
 * Admin Setup Utility
 * 
 * This script promotes a user to admin role in the database.
 * Since the app uses Replit Auth (OIDC), users are created when they first log in.
 * 
 * Usage:
 *   tsx scripts/make-admin.ts <email>
 * 
 * Example:
 *   tsx scripts/make-admin.ts admin@concordia.com
 */

import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function makeAdmin(email: string) {
  if (!email) {
    console.error("Error: Email is required");
    console.log("\nUsage: tsx scripts/make-admin.ts <email>");
    console.log("Example: tsx scripts/make-admin.ts admin@concordia.com");
    process.exit(1);
  }

  try {
    // Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!user) {
      console.error(`Error: No user found with email: ${email}`);
      console.log("\nNote: Users are created automatically when they first log in via Replit Auth.");
      console.log("Please log in to the application first, then run this script again.");
      process.exit(1);
    }

    // Check if already admin
    if (user.role === "admin") {
      console.log(`User ${email} is already an admin.`);
      process.exit(0);
    }

    // Update user role to admin
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.email, email));

    console.log(`✓ Successfully promoted ${email} to admin role!`);
    console.log(`\nUser details:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Previous role: ${user.role}`);
    console.log(`  New role: admin`);
    console.log(`\nYou can now access the admin dashboard at /admin`);
    
    process.exit(0);
  } catch (error) {
    console.error("Error updating user:", error);
    process.exit(1);
  }
}

const email = process.argv[2];
makeAdmin(email);
