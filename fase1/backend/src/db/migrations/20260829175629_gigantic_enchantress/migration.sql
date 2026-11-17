CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"spendingLimit" numeric(10,2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric(10,2) NOT NULL,
	"totalAmount" numeric(10,2) NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intentions" ADD CONSTRAINT "intentions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "intentions" ADD CONSTRAINT "intentions_productId_products_id_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id");