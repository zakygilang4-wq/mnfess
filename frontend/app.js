const message =
  document.getElementById("message");

const counter =
  document.getElementById("counter");

const send =
  document.getElementById("send");

const status =
  document.getElementById("status");

const feed =
  document.getElementById("feed");


message.addEventListener(
  "input",
  () => {

    counter.textContent =
      `${message.value.length}/1000`;

  }
);


function escapeHtml(text) {

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


async function loadMessages() {

  feed.innerHTML =
    "<div class='post'>Loading...</div>";

  try {

    const response =
      await fetch("/api/messages");

    const data =
      await response.json();

    if (!data.length) {

      feed.innerHTML =
        `<div class="post">
          Belum ada menfess 😭
        </div>`;

      return;
    }

    feed.innerHTML =
      data.map(item => {

        const date =
          new Date(
            item.createdAt
          ).toLocaleString(
            "id-ID"
          );

        return `
          <article class="post">

            <p>
              ${escapeHtml(item.text)}
            </p>

            <div class="meta">
              💌 Anonim • ${date}
            </div>

          </article>
        `;

      }).join("");

  } catch (error) {

    feed.innerHTML =
      `<div class="post">
        Gagal mengambil menfess.
      </div>`;

  }

}


send.addEventListener(
  "click",
  async () => {

    const text =
      message.value.trim();

    if (!text) {

      status.textContent =
        "Tulis pesan dulu.";

      return;
    }

    send.disabled = true;

    status.textContent =
      "🤖 AI sedang memeriksa...";

    try {

      const response =
        await fetch(
          "/api/messages",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              text
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        status.textContent =
          "❌ " +
          (data.reason ||
            "Pesan ditolak.");

        return;
      }

      message.value = "";

      counter.textContent =
        "0/1000";

      status.textContent =
        "✅ Menfess berhasil dikirim!";

      loadMessages();

    } catch {

      status.textContent =
        "❌ Server tidak terhubung.";

    } finally {

      send.disabled = false;

    }

  }
);


loadMessages();
