import { Navigate, useParams } from "react-router-dom";
import { Notebook } from "@/components/notebook/Notebook";

export default function NotebookPage() {
  const { id } = useParams();

  if (!id) return <Navigate to="/" replace />;

  return <Notebook notebookId={id} />;
}

