-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "platforms" "Platform"[] DEFAULT ARRAY[]::"Platform"[];
