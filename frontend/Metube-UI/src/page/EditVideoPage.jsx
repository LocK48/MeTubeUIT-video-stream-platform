import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiBase } from "../service/apiBase.js";


const EditVideoPage = () => {
  const { videoId } = useParams();

  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVideo = async () => {
      try {
        const response = await fetch(
          `${apiBase}/${videoId}/edit`,
          {
            credentials: "include",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Can not find video");
        }

        setTitle(data.title || "");
        setDescription(data.description || "");
      } 
      catch (err) {
        console.error(err);
      } 
      finally {
        setLoading(false);
      }
    };

    if (videoId) {
      loadVideo();
    }
  }, [videoId]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(
        `${apiBase}/${videoId}/edit`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            description,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Update failed");
      }

      alert("Update successfully");

      navigate("/your-videos");
    } 
    catch (err) {
      console.error(err);
      alert(err.message || "Update failed");
    }
  };

  if (loading) {
    return <div className="text-white p-6">Loading...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 text-white">
      <h1 className="text-3xl font-bold mb-6">Chỉnh sửa video</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {/* TITLE */}
        <div>
          <label className="block mb-2 text-lg text-blue-400">Tiêu đề</label>

          <input
            autoComplete="false"
            spellCheck="false"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#1f1f1f] border-none rounded-xl p-1.5 outline-none"
            maxLength={100}
          />
        </div>

        {/* DESCRIPTION */}
        <div>
          <label className="block mb-2 text-lg text-blue-400">Mô tả</label>
          <textarea
            autoComplete="false"
            spellCheck="false"
            rows={8}
            value={description}
            maxLength={5000}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-[#1f1f1f] border-none rounded-xl p-2 outline-none resize-none"
          />
        </div>


        <button
          type="submit"
          className="ml-auto btn btn-danger hover:bg-[#65b8ff] text-white font-semibold px-3 py-2 rounded-xl transition"
        >
          Save change
        </button>
      </form>
    </div>
  );
};

export default EditVideoPage;
