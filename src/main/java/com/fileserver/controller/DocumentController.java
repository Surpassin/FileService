package com.fileserver.controller;

import com.fileserver.constant.ModuleType;
import com.fileserver.entity.Documents;
import com.fileserver.request.DocumentUploadRequest;
import com.fileserver.service.DocumentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    @Autowired
    private DocumentService documentService;

    @PostMapping("/upload")
    public ResponseEntity<List<Documents>> uploadDocuments(
            @RequestPart("files") List<MultipartFile> files,
            @RequestPart("metadata") DocumentUploadRequest request
    ) throws IOException {
        List<Documents> uploadedDocs = documentService.uploadDocuments(files, request);
        return ResponseEntity.ok(uploadedDocs);
    }

    @GetMapping("/{module}/{referenceId}")
    public ResponseEntity<List<Documents>> getDocuments(
            @PathVariable ModuleType module,
            @PathVariable Long referenceId
    ) {
        List<Documents> docs = documentService.getDocumentsByModuleAndReference(module, referenceId);
        return ResponseEntity.ok(docs);
    }
}
