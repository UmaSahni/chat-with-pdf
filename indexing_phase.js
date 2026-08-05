import * as dotenv from 'dotenv';
dotenv.config();

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'; // Load the PDF
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'; // Craete the chunking of the PDF
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'; // Embedding the Chunked PDF
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';


export const indexing = async (fileBuffer, fileName, docType, namespace) => {
    let rawDocs;
    if (fileBuffer) {
        // Load PDF from buffer (Node Blob)
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        const pdfLoader = new PDFLoader(blob);
        rawDocs = await pdfLoader.load();
    } else {
        // Fallback for direct CLI execution
        const PDF_PATH = './science.pdf';
        const pdfLoader = new PDFLoader(PDF_PATH);
        rawDocs = await pdfLoader.load();
        fileName = 'science.pdf';
        docType = 'general';
        namespace = 'default';
    }

    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const chunkedDocs = await textSplitter.splitDocuments(rawDocs);
    console.log(`Document chunked into ${chunkedDocs.length} parts.`);

    // Inject custom metadata tags for multi-document relational query support
    chunkedDocs.forEach(doc => {
        doc.metadata = {
            ...doc.metadata,
            source_name: fileName,
            document_type: docType
        };
    });

    // Configure the embedding (Dimension: 3072, matching the Pinecone index)
    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        model: 'text-embedding-004',
        outputDimensionality: 3072,
    });

    // Configure Pinecone
    const pinecone = new Pinecone();
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    // Save to the specified namespace in Pinecone
    console.log(`Uploading to Pinecone index: "${process.env.PINECONE_INDEX_NAME}" under namespace: "${namespace}"...`);
    await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
        pineconeIndex,
        namespace,
        maxConcurrency: 5,
    });
    console.log("Upload completed.");
}

if (process.argv[1] && (process.argv[1].endsWith('indexing_phase.js') || process.argv[1].endsWith('indexing_phase'))) {
    indexing();
}