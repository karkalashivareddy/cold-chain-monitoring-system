import { Link } from "react-router-dom";
import { Button } from "@/components/ui";

export default function NotFoundPage() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ice">Page not found</h1>
      <p className="mt-2 text-sm text-mist">The page you requested does not exist or you no longer have access.</p>
      <Link to="/app"><Button className="mt-6">Return to overview</Button></Link>
    </div>
  );
}
