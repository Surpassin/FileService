package com.fileserver.entity;

import com.fileserver.constant.ModuleType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.domain.Auditable;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "documents")
@Data
@AllArgsConstructor
@NoArgsConstructor
public  class Documents  {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "document_category", nullable = false)
    private Integer documentCategory;

    @Column(name = "document_name", nullable = false)
    private String documentName;

    @Column(name = "document_type")
    private String documentType;

    @Enumerated(EnumType.STRING)
    @Column(name = "module")
    private ModuleType module;

    @Column(name = "document_url", nullable = false)
    private String documentUrl;

    @Column(name = "reference_id", nullable = false)
    private Long referenceId;

    @Column(name = "record_status")
    private Boolean recordStatus;

    @CreatedBy
    private Integer createdBy;

    @CreatedDate
    private LocalDateTime createdDate;

    @LastModifiedBy
    private Integer updatedBy;

    @LastModifiedDate
    private LocalDateTime updatedDate;


    @PrePersist
    public void onCreate() {
        this.createdDate = LocalDateTime.now();
        this.updatedDate = LocalDateTime.now();
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedDate = LocalDateTime.now();
    }



}
