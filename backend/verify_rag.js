
const { ChromaClient } = require('chromadb');

async function check() {
    try {
        const client = new ChromaClient({ path: "http://localhost:8000" });
        const collection = await client.getCollection({ name: 'neon-knowledge-base' });

        // This simulates the query from AIRouter
        // We'd need embeddings here, but we can't easily generate them in JS without the service.
        // So I'll just check if query with many results finds it.
        console.log("Querying for Vanessa Mai info...");

        const result = await collection.get({
            where: { "source": "Vanessa_Mai.pdf" },
            include: ["metadatas", "documents"]
        });

        console.log(`Analyzing ${result.documents.length} chunks...`);
        const found = result.documents.find(doc => doc.includes("2. Mai 1992"));
        if (found) {
            console.log("SUCCESS: Found birth date in chunks!");
        } else {
            console.log("FAILURE: Birth date NOT found in ANY chunk of Vanessa_Mai.pdf (unlikely based on previous check)");
        }

    } catch (e) {
        console.error(e);
    }
}
check();
