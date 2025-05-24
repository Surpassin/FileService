package com.fileserver.service;

import com.fileserver.constant.ModuleType;
import com.fileserver.entity.Documents;
import com.fileserver.repository.DocumentsRepository;
import com.fileserver.request.DocumentUploadRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
public class DocumentService {

    @Autowired
    private DocumentsRepository documentsRepository;

    @Autowired
    private FileStorageService fileStorageService;

    public List<Documents> uploadDocuments(List<MultipartFile> files, DocumentUploadRequest request) throws IOException, IOException {
        List<Documents> savedDocs = new ArrayList<>();

        for (MultipartFile file : files) {
            String fileUrl = fileStorageService.uploadFile(file, request.getModule().name());

            Documents doc = new Documents();
            doc.setDocumentCategory(request.getDocumentCategory());
            doc.setDocumentName(file.getOriginalFilename());
            doc.setDocumentType(file.getContentType());
            doc.setModule(request.getModule());
            doc.setDocumentUrl(fileUrl);
            doc.setReferenceId(request.getReferenceId());
            doc.setRecordStatus(true);

            savedDocs.add(documentsRepository.save(doc));
        }

        return savedDocs;
    }

    public List<Documents> getDocumentsByModuleAndReference(ModuleType module, Long referenceId) {
        return documentsRepository.findByModuleAndReferenceId(module, referenceId);
    }
}
