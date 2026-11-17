CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"price" numeric(10,2) NOT NULL,
	"currency" text NOT NULL,
	"stock" integer NOT NULL,
	"category" text NOT NULL
);
