export async function POST() {
  return Response.json(
    { error: "Public account registration is disabled." },
    { status: 410 },
  );
}
