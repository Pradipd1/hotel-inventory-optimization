import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/Display.jsx';

export default function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="Page not found"
        message="The page you are looking for does not exist or has moved."
        action={<Link to="/" className="text-sm font-medium text-brand-700 hover:underline">Go to dashboard</Link>}
      />
    </div>
  );
}
