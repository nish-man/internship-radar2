import axios from "axios";
import * as cheerio from "cheerio";

export async function GET() {
  try {

    const url = "https://app.otta.com/jobs";

    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
      }
    });

    const $ = cheerio.load(res.data);

    const jobs = [];

    $(".css-1q9x1sy").each((i, el) => {

      const role = $(el).find("h3").text().trim();
      const company = $(el).find("span").first().text().trim();
      const link = "https://app.otta.com" + $(el).find("a").attr("href");

      if (role.toLowerCase().includes("intern")) {
        jobs.push({
          company,
          role,
          link
        });
      }

    });

    return Response.json({ jobs });

  } catch (err) {
    return Response.json({ error: err.message });
  }
}
