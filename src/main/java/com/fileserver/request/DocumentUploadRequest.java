package com.fileserver.request;

import com.fileserver.constant.ModuleType;
import lombok.Data;

@Data
public class DocumentUploadRequest {
    private Integer documentCategory;
    private ModuleType module;
    private Long referenceId;
}
