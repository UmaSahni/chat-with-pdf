import * as dotenv from 'dotenv';
dotenv.config();

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'; // Load the PDF
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'; // Craete the chunking of the PDF
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'; // Embedding the Chunked PDF
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';


const indexing = async () => {
    const PDF_PATH = './science.pdf';
    const pdfLoader = new PDFLoader(PDF_PATH);
    // Loads the raw PDF
    const rawDocs = await pdfLoader.load();

    // console.log(rawDocs, "RawDocs")

    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const chunkedDocs = await textSplitter.splitDocuments(rawDocs);
    console.log(chunkedDocs.length)

    // Configure the enbedding
    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-embedding-001',
        outputDimensionality: 1536,
    });

    const vec = await embeddings.embedQuery("hello world");
    console.log("length:", vec.length);
    
    // Configure Pinecode
    const pinecone = new Pinecone();
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

    await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
    pineconeIndex,
    maxConcurrency: 5,
   });





}

indexing()