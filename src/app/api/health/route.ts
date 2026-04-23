import { NextResponse } from "next/server";
import { getSealedForecastModelStatus } from "@/lib/db/sealed-forecast-models";
import { hasPriceChartingToken } from "@/lib/server/pricecharting";

export async function GET() {
  const sealedMl = await getSealedForecastModelStatus();

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      dynamodb: {
        configured: sealedMl.dynamoConfigured,
        tableName: sealedMl.tableName,
        region: sealedMl.awsRegion,
      },
      monthlyIngestion: {
        pokedataConfigured: Boolean(process.env.POKEDATA_API_KEY?.trim()),
        priceChartingConfigured: hasPriceChartingToken(),
      },
      sealedMl,
    },
  });
}
