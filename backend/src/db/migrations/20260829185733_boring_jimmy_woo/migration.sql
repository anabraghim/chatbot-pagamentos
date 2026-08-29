CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"intentionId" uuid NOT NULL UNIQUE,
	"userId" uuid NOT NULL,
	"amount" numeric(10,2) NOT NULL,
	"currency" text NOT NULL,
	"paymentMethod" text NOT NULL,
	"status" text DEFAULT 'aprovado' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_intentionId_intentions_id_fkey" FOREIGN KEY ("intentionId") REFERENCES "intentions"("id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");